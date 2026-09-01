import assert from "node:assert/strict";
import test from "node:test";

import { InputAssetNotOwnedError } from "./contracts.js";
import type {
  AssetRecord,
  DatabaseStore,
  DatabaseTransaction,
  JobInputAssetRecord,
  JobRecord,
  JobStatus,
  SubmitJobCommand,
  TransactionOptions,
} from "./contracts.js";
import {
  InFlightLimitError,
  InsufficientCreditsError,
  claimQueuedJob,
  completeJobWithAssets,
  failAndRefund,
  findStaleQueuedJobs,
  loadJobInputAssets,
  saveExternalTaskId,
  submitJob,
} from "./jobs.js";

interface FakeState {
  balance: number;
  jobs: Map<string, JobRecord>;
  ledgers: Array<{
    id: string;
    userId: string;
    delta: number;
    reason: string;
    createdAt: Date;
  }>;
  assets: AssetRecord[];
  jobInputAssets: JobInputAssetRecord[];
  nextJobId: number;
  nextLedgerId: number;
  nextAssetId: number;
  nextJobInputAssetId: number;
}

interface FakeStoreOptions {
  balance?: number;
  jobs?: JobRecord[];
  assets?: AssetRecord[];
  serializableConflicts?: number;
  assetCreateError?: Error;
}

interface FakeStoreHarness {
  store: DatabaseStore;
  state(): FakeState;
  transactionCalls(): number;
  isolationLevels(): Array<TransactionOptions["isolationLevel"] | undefined>;
}

const FIXED_TIME = new Date("2026-08-27T00:00:00.000Z");

function jobFixture(
  overrides: Partial<JobRecord> & Pick<JobRecord, "id" | "status">,
): JobRecord {
  return {
    userId: "user-1",
    type: "video",
    model: "dreamina-seedance-2-0-fast-260128",
    inputParams: {
      prompt: "orbital sunrise",
      params: {
        type: "video",
        resolution: "720p",
        ratio: "21:9",
        durationSeconds: 5,
    withAudio: false,
      rounds: 1,
      },
    },
    externalTaskId: null,
    chainProgress: null,
    errorMessage: null,
    creditsCost: 14,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    ...overrides,
  };
}

function cloneState(state: FakeState): FakeState {
  return {
    balance: state.balance,
    jobs: new Map(
      [...state.jobs].map(([id, job]) => [
        id,
        { ...job, inputParams: structuredClone(job.inputParams) },
      ]),
    ),
    ledgers: state.ledgers.map((ledger) => ({ ...ledger })),
    assets: state.assets.map((asset) => ({ ...asset })),
    jobInputAssets: state.jobInputAssets.map((link) => ({ ...link })),
    nextJobId: state.nextJobId,
    nextLedgerId: state.nextLedgerId,
    nextAssetId: state.nextAssetId,
    nextJobInputAssetId: state.nextJobInputAssetId,
  };
}

function replaceState(target: FakeState, source: FakeState): void {
  target.balance = source.balance;
  target.jobs = source.jobs;
  target.ledgers = source.ledgers;
  target.assets = source.assets;
  target.jobInputAssets = source.jobInputAssets;
  target.nextJobId = source.nextJobId;
  target.nextLedgerId = source.nextLedgerId;
  target.nextAssetId = source.nextAssetId;
  target.nextJobInputAssetId = source.nextJobInputAssetId;
}

function matchesStatus(
  actual: JobStatus,
  expected: JobStatus | { in: JobStatus[] } | undefined,
): boolean {
  if (expected === undefined) return true;
  return typeof expected === "string"
    ? actual === expected
    : expected.in.includes(actual);
}

function fakeTransaction(
  state: FakeState,
  assetCreateError?: Error,
): DatabaseTransaction {
  return {
    user: {
      create: async ({ data }) => ({
        id: "user-1",
        email: data.email,
        name: data.name,
        emailVerified: data.emailVerified,
        image: data.image,
        creditBalance: data.creditBalance,
        createdAt: FIXED_TIME,
      }),
      updateMany: async ({ where, data }) => {
        if (where.id !== "user-1") return { count: 0 };
        if (
          where.creditBalance?.gte !== undefined &&
          state.balance < where.creditBalance.gte
        ) {
          return { count: 0 };
        }
        if (data.creditBalance.decrement !== undefined) {
          state.balance -= data.creditBalance.decrement;
        }
        if (data.creditBalance.increment !== undefined) {
          state.balance += data.creditBalance.increment;
        }
        return { count: 1 };
      },
    },
    creditLedgerEntry: {
      create: async ({ data }) => {
        const ledger = {
          id: `ledger-${state.nextLedgerId++}`,
          userId: data.userId,
          delta: data.delta,
          reason: data.reason,
          createdAt: FIXED_TIME,
        };
        state.ledgers.push(ledger);
        return ledger;
      },
    },
    job: {
      count: async ({ where }) =>
        [...state.jobs.values()].filter(
          (job) =>
            job.userId === where.userId &&
            matchesStatus(job.status, where.status),
        ).length,
      create: async ({ data }) => {
        const job = jobFixture({
          id: `job-${state.nextJobId++}`,
          userId: data.userId,
          type: data.type,
          model: data.model,
          status: data.status,
          inputParams: structuredClone(data.inputParams),
          creditsCost: data.creditsCost,
        });
        state.jobs.set(job.id, job);
        return job;
      },
      updateMany: async ({ where, data }) => {
        const job = state.jobs.get(where.id);
        if (job === undefined || !matchesStatus(job.status, where.status)) {
          return { count: 0 };
        }
        state.jobs.set(job.id, {
          ...job,
          ...(data.status === undefined ? {} : { status: data.status }),
          ...(data.errorMessage === undefined
            ? {}
            : { errorMessage: data.errorMessage }),
          ...(data.externalTaskId === undefined
            ? {}
            : { externalTaskId: data.externalTaskId }),
          updatedAt: FIXED_TIME,
        });
        return { count: 1 };
      },
      findUnique: async ({ where }) => state.jobs.get(where.id) ?? null,
      findMany: async ({ where, orderBy, take }) => {
        const direction = orderBy.createdAt === "asc" ? 1 : -1;
        return [...state.jobs.values()]
          .filter(
            (job) =>
              job.status === where.status &&
              job.createdAt.getTime() <= where.createdAt.lte.getTime(),
          )
          .sort(
            (left, right) =>
              direction *
              (left.createdAt.getTime() - right.createdAt.getTime()),
          )
          .slice(0, take);
      },
    },
    asset: {
      create: async ({ data }) => {
        if (assetCreateError !== undefined) throw assetCreateError;
        const asset: AssetRecord = {
          id: `asset-${state.nextAssetId++}`,
          jobId: data.jobId,
          userId: data.userId,
          type: data.type,
          storageUrl: data.storageUrl,
          thumbnailUrl: data.thumbnailUrl ?? null,
          createdAt: FIXED_TIME,
        };
        state.assets.push(asset);
        return asset;
      },
      findMany: async ({ where }) =>
        state.assets.filter(
          (asset) =>
            where.id.in.includes(asset.id) && asset.userId === where.userId,
        ),
      createUploaded: async ({ data }) => {
        const asset: AssetRecord = {
          id: `asset-${state.nextAssetId++}`,
          jobId: null,
          userId: data.userId,
          type: data.type,
          storageUrl: data.storageUrl,
          thumbnailUrl: null,
          createdAt: FIXED_TIME,
        };
        state.assets.push(asset);
        return asset;
      },
    },
    jobInputAsset: {
      createMany: async ({ data }) => {
        for (const link of data) {
          state.jobInputAssets.push({
            id: `job-input-${state.nextJobInputAssetId++}`,
            jobId: link.jobId,
            assetId: link.assetId,
            role: link.role,
            position: link.position,
          });
        }
        return { count: data.length };
      },
      findMany: async ({ where }) =>
        state.jobInputAssets
          .filter((link) => link.jobId === where.jobId)
          .sort((left, right) => left.position - right.position),
    },
  };
}

function fakeStore(options: FakeStoreOptions = {}): FakeStoreHarness {
  const current: FakeState = {
    balance: options.balance ?? 100,
    jobs: new Map((options.jobs ?? []).map((job) => [job.id, job])),
    ledgers: [],
    assets: [...(options.assets ?? [])],
    jobInputAssets: [],
    nextJobId: 1,
    nextLedgerId: 1,
    nextAssetId: 1,
    nextJobInputAssetId: 1,
  };
  let remainingConflicts = options.serializableConflicts ?? 0;
  let transactionCallCount = 0;
  const isolationLevels: Array<
    TransactionOptions["isolationLevel"] | undefined
  > = [];
  const direct = fakeTransaction(current, options.assetCreateError);
  const store: DatabaseStore = {
    ...direct,
    transaction: async (operation, transactionOptions) => {
      transactionCallCount += 1;
      isolationLevels.push(transactionOptions?.isolationLevel);
      const draft = cloneState(current);
      const result = await operation(
        fakeTransaction(draft, options.assetCreateError),
      );
      if (remainingConflicts > 0) {
        remainingConflicts -= 1;
        throw Object.assign(new Error("write conflict"), { code: "P2034" });
      }
      replaceState(current, draft);
      return result;
    },
  };

  return {
    store,
    state: () => current,
    transactionCalls: () => transactionCallCount,
    isolationLevels: () => isolationLevels,
  };
}

const VIDEO_COMMAND: SubmitJobCommand = {
  userId: "user-1",
  type: "video",
  prompt: "orbital sunrise",
  params: {
    type: "video",
    resolution: "720p",
    ratio: "21:9",
    durationSeconds: 5,
    withAudio: false,
      rounds: 1,
  },
  model: "dreamina-seedance-2-0-fast-260128",
  creditsCost: 14,
  maxInFlight: 3,
};

test("submission stores the server-resolved model and immutable cost", async () => {
  const harness = fakeStore({ balance: 100 });

  const result = await submitJob(harness.store, VIDEO_COMMAND);

  assert.equal(result.job.model, "dreamina-seedance-2-0-fast-260128");
  assert.equal(result.job.creditsCost, 14);
  assert.equal(result.job.status, "queued");
  // Params are persisted alongside the prompt so a later config change never
  // retroactively alters what this job actually ran with.
  assert.deepEqual(result.job.inputParams, {
    prompt: "orbital sunrise",
    params: {
      type: "video",
      resolution: "720p",
      ratio: "21:9",
      durationSeconds: 5,
    withAudio: false,
      rounds: 1,
    },
  });
  assert.equal(result.ledger.reason, `generation:${result.job.id}`);
  assert.equal(result.ledger.delta, -14);
  assert.equal(harness.state().balance, 86);
});

// --- Input assets -----------------------------------------------------------

function assetFixture(id: string, userId: string): AssetRecord {
  return {
    id,
    jobId: "some-earlier-job",
    userId,
    type: "image",
    storageUrl: `tos://bucket/${id}.png`,
    thumbnailUrl: null,
    createdAt: FIXED_TIME,
  };
}

test("submission links input assets the user owns", async () => {
  const harness = fakeStore({
    balance: 100,
    assets: [assetFixture("asset-a", "user-1"), assetFixture("asset-b", "user-1")],
  });

  const result = await submitJob(harness.store, {
    ...VIDEO_COMMAND,
    inputAssets: [
      { assetId: "asset-a", role: "first_frame" },
      { assetId: "asset-b", role: "reference" },
    ],
  });

  const links = harness.state().jobInputAssets;
  assert.equal(links.length, 2);
  assert.deepEqual(
    links.map((link) => ({ assetId: link.assetId, role: link.role, position: link.position })),
    [
      { assetId: "asset-a", role: "first_frame", position: 0 },
      { assetId: "asset-b", role: "reference", position: 1 },
    ],
  );
  assert.ok(links.every((link) => link.jobId === result.job.id));
});

test("submission refuses an asset owned by another user and charges nothing", async () => {
  const harness = fakeStore({
    balance: 100,
    // The asset exists, but belongs to someone else.
    assets: [assetFixture("someone-elses", "user-2")],
  });

  await assert.rejects(
    submitJob(harness.store, {
      ...VIDEO_COMMAND,
      inputAssets: [{ assetId: "someone-elses", role: "first_frame" }],
    }),
    InputAssetNotOwnedError,
  );

  // The whole transaction must roll back: no debit, no job, no links.
  assert.equal(harness.state().balance, 100);
  assert.equal(harness.state().jobs.size, 0);
  assert.equal(harness.state().ledgers.length, 0);
  assert.equal(harness.state().jobInputAssets.length, 0);
});

test("submission refuses an asset id that does not exist", async () => {
  const harness = fakeStore({ balance: 100, assets: [] });

  await assert.rejects(
    submitJob(harness.store, {
      ...VIDEO_COMMAND,
      inputAssets: [{ assetId: "ghost", role: "reference" }],
    }),
    InputAssetNotOwnedError,
  );
  assert.equal(harness.state().balance, 100);
});

test("submission rejects if any one of several assets is unowned", async () => {
  const harness = fakeStore({
    balance: 100,
    assets: [assetFixture("mine", "user-1"), assetFixture("theirs", "user-2")],
  });

  await assert.rejects(
    submitJob(harness.store, {
      ...VIDEO_COMMAND,
      inputAssets: [
        { assetId: "mine", role: "first_frame" },
        { assetId: "theirs", role: "reference" },
      ],
    }),
    InputAssetNotOwnedError,
  );
  assert.equal(harness.state().jobs.size, 0);
});

test("loadJobInputAssets resolves links to storage URLs in position order", async () => {
  const harness = fakeStore({
    balance: 100,
    assets: [assetFixture("asset-a", "user-1"), assetFixture("asset-b", "user-1")],
  });

  const result = await submitJob(harness.store, {
    ...VIDEO_COMMAND,
    inputAssets: [
      { assetId: "asset-b", role: "reference" },
      { assetId: "asset-a", role: "first_frame" },
    ],
  });

  const resolved = await loadJobInputAssets(harness.store, result.job.id, "user-1");
  assert.deepEqual(
    resolved.map((asset) => ({ assetId: asset.assetId, role: asset.role, storageUrl: asset.storageUrl })),
    [
      { assetId: "asset-b", role: "reference", storageUrl: "tos://bucket/asset-b.png" },
      { assetId: "asset-a", role: "first_frame", storageUrl: "tos://bucket/asset-a.png" },
    ],
  );
});

test("loadJobInputAssets returns nothing for a different user", async () => {
  const harness = fakeStore({
    balance: 100,
    assets: [assetFixture("asset-a", "user-1")],
  });
  const result = await submitJob(harness.store, {
    ...VIDEO_COMMAND,
    inputAssets: [{ assetId: "asset-a", role: "reference" }],
  });

  // Defense in depth: even with a valid jobId, the wrong userId resolves nothing.
  const resolved = await loadJobInputAssets(harness.store, result.job.id, "user-2");
  assert.deepEqual(resolved, []);
});

test("submission with no input assets creates no links", async () => {
  const harness = fakeStore({ balance: 100 });
  await submitJob(harness.store, VIDEO_COMMAND);
  assert.equal(harness.state().jobInputAssets.length, 0);
});

test("submission rejects the fourth queued or processing job before debit", async () => {
  const harness = fakeStore({
    balance: 100,
    jobs: [
      jobFixture({ id: "queued-1", status: "queued" }),
      jobFixture({ id: "processing-1", status: "processing" }),
      jobFixture({ id: "queued-2", status: "queued" }),
    ],
  });

  await assert.rejects(
    submitJob(harness.store, VIDEO_COMMAND),
    InFlightLimitError,
  );
  assert.equal(harness.state().balance, 100);
  assert.equal(harness.state().jobs.size, 3);
  assert.equal(harness.state().ledgers.length, 0);
});

test("submission never debits a balance below the stored job cost", async () => {
  const harness = fakeStore({ balance: 13 });

  await assert.rejects(
    submitJob(harness.store, VIDEO_COMMAND),
    InsufficientCreditsError,
  );
  assert.equal(harness.state().balance, 13);
  assert.equal(harness.state().jobs.size, 0);
  assert.equal(harness.state().ledgers.length, 0);
});

test("submission retries serializable P2034 conflicts and commits once", async () => {
  const harness = fakeStore({ balance: 100, serializableConflicts: 2 });

  await submitJob(harness.store, VIDEO_COMMAND);

  assert.equal(harness.transactionCalls(), 3);
  assert.deepEqual(harness.isolationLevels(), [
    "Serializable",
    "Serializable",
    "Serializable",
  ]);
  assert.equal(harness.state().balance, 86);
  assert.equal(harness.state().jobs.size, 1);
  assert.equal(harness.state().ledgers.length, 1);
});

test("submission stops after three P2034 retries", async () => {
  const harness = fakeStore({ balance: 100, serializableConflicts: 4 });

  await assert.rejects(submitJob(harness.store, VIDEO_COMMAND), {
    code: "P2034",
  });
  assert.equal(harness.transactionCalls(), 4);
  assert.equal(harness.state().balance, 100);
  assert.equal(harness.state().jobs.size, 0);
  assert.equal(harness.state().ledgers.length, 0);
});

test("refund changes state and restores credits only once", async () => {
  const harness = fakeStore({
    balance: 86,
    jobs: [jobFixture({ id: "job-refund", status: "processing" })],
  });

  assert.equal(
    await failAndRefund(harness.store, "job-refund", "provider failed"),
    true,
  );
  const afterFirst = cloneState(harness.state());
  assert.equal(afterFirst.jobs.get("job-refund")?.status, "failed");
  assert.equal(
    afterFirst.jobs.get("job-refund")?.errorMessage,
    "provider failed",
  );
  assert.equal(afterFirst.balance, 100);
  assert.deepEqual(
    afterFirst.ledgers.map(({ delta, reason }) => ({ delta, reason })),
    [{ delta: 14, reason: "refund:job-refund" }],
  );

  assert.equal(
    await failAndRefund(harness.store, "job-refund", "duplicate listener"),
    false,
  );
  assert.deepEqual(harness.state(), afterFirst);
});

test("refund can fail and restore a queued job before worker claim", async () => {
  const harness = fakeStore({
    balance: 86,
    jobs: [jobFixture({ id: "job-never-enqueued", status: "queued" })],
  });

  assert.equal(
    await failAndRefund(
      harness.store,
      "job-never-enqueued",
      "queue unavailable",
    ),
    true,
  );
  assert.equal(harness.state().jobs.get("job-never-enqueued")?.status, "failed");
  assert.equal(harness.state().balance, 100);
});

test("claim succeeds once and returns null after the job is processing", async () => {
  const harness = fakeStore({
    jobs: [jobFixture({ id: "job-claim", status: "queued" })],
  });

  assert.equal(await claimQueuedJob(harness.store, "job-claim"), true);
  assert.equal(await claimQueuedJob(harness.store, "job-claim"), null);
  assert.equal(harness.state().jobs.get("job-claim")?.status, "processing");
});

test("claim returns null for a job that was already processing", async () => {
  const harness = fakeStore({
    jobs: [jobFixture({ id: "job-processing", status: "processing" })],
  });

  assert.equal(
    await claimQueuedJob(harness.store, "job-processing"),
    null,
  );
});

for (const status of ["complete", "failed"] as const) {
  test(`claim returns null for a terminal ${status} job`, async () => {
    const harness = fakeStore({
      jobs: [jobFixture({ id: `job-${status}`, status })],
    });

    assert.equal(await claimQueuedJob(harness.store, `job-${status}`), null);
  });
}

test("saveExternalTaskId persists the provider task identifier", async () => {
  const harness = fakeStore({
    jobs: [jobFixture({ id: "job-video", status: "processing" })],
  });

  await saveExternalTaskId(harness.store, "job-video", "modelark-task-1");

  assert.equal(
    harness.state().jobs.get("job-video")?.externalTaskId,
    "modelark-task-1",
  );
});

test("completion changes processing to complete and creates its user-owned asset", async () => {
  const harness = fakeStore({
    jobs: [jobFixture({ id: "job-complete", status: "processing" })],
  });

  const result = await completeJobWithAssets(harness.store, "job-complete", [
    {
      type: "video",
      storageUrl: "tos://assets/user-1/job-complete/video.mp4",
      thumbnailUrl: "tos://assets/user-1/job-complete/thumb.png",
    },
  ]);

  assert.equal(result.job.status, "complete");
  assert.equal(result.assets[0]?.jobId, "job-complete");
  assert.equal(result.assets[0]?.userId, "user-1");
  assert.equal(harness.state().assets.length, 1);
});

test("completion rolls back its status change when asset creation fails", async () => {
  const harness = fakeStore({
    jobs: [jobFixture({ id: "job-complete", status: "processing" })],
    assetCreateError: new Error("storage row failed"),
  });

  await assert.rejects(
    completeJobWithAssets(harness.store, "job-complete", [
      { type: "video", storageUrl: "tos://assets/user-1/job-complete/video.mp4" },
    ]),
    /storage row failed/,
  );
  assert.equal(harness.state().jobs.get("job-complete")?.status, "processing");
  assert.equal(harness.state().assets.length, 0);
});

test("stale queued query applies cutoff, oldest-first order, and batch limit", async () => {
  const harness = fakeStore({
    jobs: [
      jobFixture({
        id: "oldest",
        status: "queued",
        createdAt: new Date("2026-08-27T00:00:00.000Z"),
      }),
      jobFixture({
        id: "middle",
        status: "queued",
        externalTaskId: "unexpected-but-preserved",
        chainProgress: null,
        createdAt: new Date("2026-08-27T00:00:30.000Z"),
      }),
      jobFixture({
        id: "recent",
        status: "queued",
        createdAt: new Date("2026-08-27T00:01:01.000Z"),
      }),
      jobFixture({
        id: "processing-old",
        status: "processing",
        createdAt: new Date("2026-08-26T23:59:00.000Z"),
      }),
    ],
  });

  const jobs = await findStaleQueuedJobs(
    harness.store,
    new Date("2026-08-27T00:01:00.000Z"),
    2,
  );

  assert.deepEqual(
    jobs.map(({ id, externalTaskId, creditsCost }) => ({
      id,
      externalTaskId,
      creditsCost,
    })),
    [
      { id: "oldest", externalTaskId: null, creditsCost: 14 },
      {
        id: "middle",
        externalTaskId: "unexpected-but-preserved",
        creditsCost: 14,
      },
    ],
  );
});
