import {
  InputAssetNotOwnedError,
  type AssetRecord,
  type ChainProgress,
  type CreateAssetInput,
  type CreditLedgerRecord,
  type DatabaseStore,
  type JobRecord,
  type ResolvedInputAsset,
  type SubmitJobCommand,
} from "./contracts.js";

const SERIALIZABLE_RETRY_LIMIT = 3;

export class InFlightLimitError extends Error {
  constructor(
    public readonly maxInFlight: number,
  ) {
    super(`User already has ${maxInFlight} queued or processing jobs`);
    this.name = "InFlightLimitError";
  }
}

export class InsufficientCreditsError extends Error {
  constructor(
    public readonly creditsCost: number,
  ) {
    super(`User has insufficient credits for a ${creditsCost}-credit job`);
    this.name = "InsufficientCreditsError";
  }
}

export class InvalidJobStateError extends Error {
  constructor(jobId: string, expectedState: string) {
    super(`Job ${jobId} is missing or is not ${expectedState}`);
    this.name = "InvalidJobStateError";
  }
}

export interface SubmitJobResult {
  job: JobRecord;
  ledger: CreditLedgerRecord;
}

export interface CompleteJobResult {
  job: JobRecord;
  assets: AssetRecord[];
}

function isSerializableConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  );
}

export async function submitJob(
  store: DatabaseStore,
  command: SubmitJobCommand,
): Promise<SubmitJobResult> {
  for (let retryCount = 0; ; retryCount += 1) {
    try {
      return await store.transaction(
        async (tx) => {
          const inFlight = await tx.job.count({
            where: {
              userId: command.userId,
              status: { in: ["queued", "processing"] },
            },
          });
          if (inFlight >= command.maxInFlight) {
            throw new InFlightLimitError(command.maxInFlight);
          }

          const debit = await tx.user.updateMany({
            where: {
              id: command.userId,
              creditBalance: { gte: command.creditsCost },
            },
            data: {
              creditBalance: { decrement: command.creditsCost },
            },
          });
          if (debit.count !== 1) {
            throw new InsufficientCreditsError(command.creditsCost);
          }

          // Ownership is verified inside the transaction, not before it, so a
          // concurrent delete cannot slip an unowned asset through between the
          // check and the insert.
          const requestedAssets = command.inputAssets ?? [];
          if (requestedAssets.length > 0) {
            const requestedIds = [
              ...new Set(requestedAssets.map((asset) => asset.assetId)),
            ];
            const owned = await tx.asset.findMany({
              where: { id: { in: requestedIds }, userId: command.userId },
            });
            const ownedIds = new Set(owned.map((asset) => asset.id));
            const missing = requestedIds.filter((id) => !ownedIds.has(id));
            if (missing.length > 0) {
              throw new InputAssetNotOwnedError(missing);
            }
          }

          const job = await tx.job.create({
            data: {
              userId: command.userId,
              type: command.type,
              model: command.model,
              status: "queued",
              inputParams: {
                prompt: command.prompt,
                params: command.params,
              },
              creditsCost: command.creditsCost,
            },
          });

          if (requestedAssets.length > 0) {
            // position orders multiple "reference" assets; the single-slot roles
            // keep their natural index, which is harmless.
            await tx.jobInputAsset.createMany({
              data: requestedAssets.map((asset, index) => ({
                jobId: job.id,
                assetId: asset.assetId,
                role: asset.role,
                position: index,
              })),
            });
          }
          const ledger = await tx.creditLedgerEntry.create({
            data: {
              userId: command.userId,
              delta: -command.creditsCost,
              reason: `generation:${job.id}`,
            },
          });

          return { job, ledger };
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (
        !isSerializableConflict(error) ||
        retryCount >= SERIALIZABLE_RETRY_LIMIT
      ) {
        throw error;
      }
    }
  }
}

export async function failAndRefund(
  store: DatabaseStore,
  jobId: string,
  message: string,
): Promise<boolean> {
  return store.transaction(async (tx) => {
    const failed = await tx.job.updateMany({
      where: {
        id: jobId,
        status: { in: ["queued", "processing"] },
      },
      data: {
        status: "failed",
        errorMessage: message,
      },
    });
    if (failed.count === 0) return false;

    const job = await tx.job.findUnique({ where: { id: jobId } });
    if (job === null) {
      throw new InvalidJobStateError(jobId, "available for refund");
    }

    await tx.creditLedgerEntry.create({
      data: {
        userId: job.userId,
        delta: job.creditsCost,
        reason: `refund:${job.id}`,
      },
    });
    const credited = await tx.user.updateMany({
      where: { id: job.userId },
      data: { creditBalance: { increment: job.creditsCost } },
    });
    if (credited.count !== 1) {
      throw new Error(`Cannot refund job ${jobId}: user ${job.userId} is missing`);
    }

    return true;
  });
}

export async function claimQueuedJob(
  store: DatabaseStore,
  jobId: string,
): Promise<true | null> {
  const claimed = await store.job.updateMany({
    where: { id: jobId, status: "queued" },
    data: { status: "processing" },
  });
  return claimed.count === 1 ? true : null;
}

/**
 * Records one finished round of a chain.
 *
 * Written in the same shape the worker reads back on resume. Deliberately a
 * plain overwrite rather than an append in SQL: the worker holds the full list
 * in memory for the round it just finished, and two workers never share a job.
 *
 * It also clears externalTaskId in the same statement. That task belonged to
 * the round now recorded as complete; leaving it set would make a resuming
 * worker poll a finished task and store its clip a second time — the same
 * footage, twice, in the middle of the chain.
 */
export async function saveChainProgress(
  store: DatabaseStore,
  jobId: string,
  progress: ChainProgress,
): Promise<void> {
  const updated = await store.job.updateMany({
    where: { id: jobId },
    data: { chainProgress: progress, externalTaskId: null },
  });
  if (updated.count !== 1) {
    throw new InvalidJobStateError(jobId, "available to save chain progress");
  }
}

export async function saveExternalTaskId(
  store: DatabaseStore,
  jobId: string,
  externalTaskId: string,
): Promise<void> {
  const updated = await store.job.updateMany({
    where: { id: jobId },
    data: { externalTaskId },
  });
  if (updated.count !== 1) {
    throw new InvalidJobStateError(jobId, "available to save an external task ID");
  }
}

export async function completeJobWithAssets(
  store: DatabaseStore,
  jobId: string,
  assetInputs: readonly CreateAssetInput[],
): Promise<CompleteJobResult> {
  if (assetInputs.length === 0) {
    throw new Error(`Cannot complete job ${jobId} with no assets`);
  }

  return store.transaction(async (tx) => {
    const completed = await tx.job.updateMany({
      where: { id: jobId, status: "processing" },
      data: { status: "complete" },
    });
    if (completed.count !== 1) {
      throw new InvalidJobStateError(jobId, "processing");
    }

    const job = await tx.job.findUnique({ where: { id: jobId } });
    if (job === null) {
      throw new InvalidJobStateError(jobId, "available for completion");
    }

    const assets: AssetRecord[] = [];
    for (const assetInput of assetInputs) {
      assets.push(
        await tx.asset.create({
          data: {
            jobId: job.id,
            userId: job.userId,
            type: assetInput.type,
            storageUrl: assetInput.storageUrl,
            ...(assetInput.thumbnailUrl === undefined
              ? {}
              : { thumbnailUrl: assetInput.thumbnailUrl }),
          },
        }),
      );
    }

    // A batch request states a maximum, not a quantity — the model may return
    // fewer images than were asked for and paid for. Charging for images that
    // were never produced is a real overcharge, so the shortfall is credited
    // back inside the same transaction that completes the job.
    const requested = requestedAssetCount(job);
    if (requested > assets.length) {
      const perAsset = job.creditsCost / requested;
      const refund = Math.round(perAsset * (requested - assets.length));
      if (refund > 0) {
        await tx.creditLedgerEntry.create({
          data: {
            userId: job.userId,
            delta: refund,
            reason: `refund:partial:${job.id}`,
          },
        });
        const credited = await tx.user.updateMany({
          where: { id: job.userId },
          data: { creditBalance: { increment: refund } },
        });
        if (credited.count !== 1) {
          throw new Error(
            `Cannot refund job ${jobId}: user ${job.userId} is missing`,
          );
        }
      }
    }

    return { job, assets };
  });
}

/**
 * How many assets the job was priced for. Only a batch image job can be priced
 * for more than one, so everything else answers 1.
 */
function requestedAssetCount(job: JobRecord): number {
  const params = job.inputParams.params;
  return params.type === "image" ? params.count : 1;
}

/**
 * Loads a job's input assets, resolved to the storage URLs the worker needs.
 *
 * `userId` is required and applied to the asset lookup even though the job row
 * already implies it — defense in depth, so a bug elsewhere cannot turn this
 * into a cross-user read.
 */
export async function loadJobInputAssets(
  store: DatabaseStore,
  jobId: string,
  userId: string,
): Promise<ResolvedInputAsset[]> {
  const links = await store.jobInputAsset.findMany({
    where: { jobId },
    orderBy: { position: "asc" },
  });
  if (links.length === 0) return [];

  const assets = await store.asset.findMany({
    where: { id: { in: links.map((link) => link.assetId) }, userId },
  });
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));

  return links.flatMap((link) => {
    const asset = assetsById.get(link.assetId);
    if (asset === undefined) return [];
    return [
      {
        assetId: link.assetId,
        role: link.role,
        position: link.position,
        storageUrl: asset.storageUrl,
        type: asset.type,
      },
    ];
  });
}

export async function findStaleQueuedJobs(
  store: DatabaseStore,
  cutoffTime: Date,
  limit = 100,
): Promise<JobRecord[]> {
  return store.job.findMany({
    where: {
      status: "queued",
      createdAt: { lte: cutoffTime },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}
