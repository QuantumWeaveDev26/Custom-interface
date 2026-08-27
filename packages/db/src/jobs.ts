import type {
  AssetRecord,
  CreateAssetInput,
  CreditLedgerRecord,
  DatabaseStore,
  JobRecord,
  SubmitJobCommand,
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
  asset: AssetRecord;
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

          const job = await tx.job.create({
            data: {
              userId: command.userId,
              type: command.type,
              model: command.model,
              status: "queued",
              inputParams: { prompt: command.prompt },
              creditsCost: command.creditsCost,
            },
          });
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

export async function completeJobWithAsset(
  store: DatabaseStore,
  jobId: string,
  assetInput: CreateAssetInput,
): Promise<CompleteJobResult> {
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
    const asset = await tx.asset.create({
      data: {
        jobId: job.id,
        userId: job.userId,
        type: assetInput.type,
        storageUrl: assetInput.storageUrl,
        ...(assetInput.thumbnailUrl === undefined
          ? {}
          : { thumbnailUrl: assetInput.thumbnailUrl }),
      },
    });

    return { job, asset };
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
