import assert from "node:assert/strict";
import test from "node:test";

import type {
  AssetRecord,
  DatabaseStore,
  DatabaseTransaction,
  JobRecord,
  JobStatus,
  SubmitJobCommand,
  TransactionOptions,
} from "./contracts.js";
import {
  InFlightLimitError,
  InsufficientCreditsError,
  claimQueuedJob,
  completeJobWithAsset,
  failAndRefund,
  findStaleQueuedJobs,
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
  nextJobId: number;
  nextLedgerId: number;
  nextAssetId: number;
}

interface FakeStoreOptions {
  balance?: number;
  jobs?: JobRecord[];
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
    inputParams: { prompt: "orbital sunrise" },
    externalTaskId: null,
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
    nextJobId: state.nextJobId,
    nextLedgerId: state.nextLedgerId,
    nextAssetId: state.nextAssetId,
  };
}

function replaceState(target: FakeState, source: FakeState): void {
  target.balance = source.balance;
  target.jobs = source.jobs;
  target.ledgers = source.ledgers;
  target.assets = source.assets;
  target.nextJobId = source.nextJobId;
  target.nextLedgerId = source.nextLedgerId;
  target.nextAssetId = source.nextAssetId;
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
    },
  };
}

function fakeStore(options: FakeStoreOptions = {}): FakeStoreHarness {
  const current: FakeState = {
    balance: options.balance ?? 100,
    jobs: new Map((options.jobs ?? []).map((job) => [job.id, job])),
    ledgers: [],
    assets: [],
    nextJobId: 1,
    nextLedgerId: 1,
    nextAssetId: 1,
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
  assert.deepEqual(result.job.inputParams, { prompt: "orbital sunrise" });
  assert.equal(result.ledger.reason, `generation:${result.job.id}`);
  assert.equal(result.ledger.delta, -14);
  assert.equal(harness.state().balance, 86);
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

  const result = await completeJobWithAsset(harness.store, "job-complete", {
    type: "video",
    storageUrl: "tos://assets/user-1/job-complete/video.mp4",
    thumbnailUrl: "tos://assets/user-1/job-complete/thumb.png",
  });

  assert.equal(result.job.status, "complete");
  assert.equal(result.asset.jobId, "job-complete");
  assert.equal(result.asset.userId, "user-1");
  assert.equal(harness.state().assets.length, 1);
});

test("completion rolls back its status change when asset creation fails", async () => {
  const harness = fakeStore({
    jobs: [jobFixture({ id: "job-complete", status: "processing" })],
    assetCreateError: new Error("storage row failed"),
  });

  await assert.rejects(
    completeJobWithAsset(harness.store, "job-complete", {
      type: "video",
      storageUrl: "tos://assets/user-1/job-complete/video.mp4",
    }),
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
