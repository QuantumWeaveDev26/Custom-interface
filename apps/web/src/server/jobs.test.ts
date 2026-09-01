import assert from "node:assert/strict";
import test from "node:test";

import {
  InFlightLimitError,
  InputAssetNotOwnedError,
  InsufficientCreditsError,
  type AssetRecord,
  type DatabaseStore,
  type JobRecord,
} from "@creative-ai/db";
import { InvalidJobRequest, type CreditPricing } from "@creative-ai/shared-types";

import { submitGenerationJob, type SubmitJobDependencies } from "./jobs.js";

// These tests exercise the real submitJob transaction logic against an
// in-memory store, so the credit debit, in-flight cap, and input-asset
// ownership check are all genuinely executed rather than stubbed out.

const FIXED_TIME = new Date("2026-08-28T00:00:00.000Z");

const PRICING: CreditPricing = {
  imageCredits: 1,
  voiceCredits: 1,
  videoCreditsPerSecond720p: 2.8,
  model3dCredits: 20,
  videoModels: ["dreamina-seedance-2-5-260628", "dreamina-seedance-2-0-260128"],
};

const MODELS = {
  image: "seedream-5-0-lite-260128",
  video: "dreamina-seedance-2-0-fast-260128",
  voice: "seed-tts-2.0",
  model3d: "hyper3d-gen2-260112",
} as const;

interface HarnessOptions {
  balance?: number;
  inFlightJobs?: number;
  assets?: AssetRecord[];
  enqueueError?: Error;
}

function harness(options: HarnessOptions = {}) {
  const state = {
    balance: options.balance ?? 100,
    jobs: [] as JobRecord[],
    ledgers: [] as Array<{ delta: number; reason: string }>,
    inputLinks: [] as Array<{ jobId: string; assetId: string; role: string }>,
    assets: options.assets ?? [],
  };
  const enqueued: string[] = [];
  let nextId = 1;

  const tx = {
    user: {
      create: async () => {
        throw new Error("unused");
      },
      updateMany: async ({ where, data }: any) => {
        if (
          where.creditBalance !== undefined &&
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
      create: async ({ data }: any) => {
        state.ledgers.push({ delta: data.delta, reason: data.reason });
        return { id: `ledger-${state.ledgers.length}`, ...data, createdAt: FIXED_TIME };
      },
    },
    job: {
      count: async () =>
        options.inFlightJobs ??
        state.jobs.filter(
          (job) => job.status === "queued" || job.status === "processing",
        ).length,
      create: async ({ data }: any) => {
        const job: JobRecord = {
          id: `job-${nextId++}`,
          userId: data.userId,
          type: data.type,
          model: data.model,
          status: "queued",
          inputParams: data.inputParams,
          externalTaskId: null,
      chainProgress: null,
          errorMessage: null,
          creditsCost: data.creditsCost,
          createdAt: FIXED_TIME,
          updatedAt: FIXED_TIME,
        };
        state.jobs.push(job);
        return job;
      },
      updateMany: async ({ where, data }: any) => {
        const job = state.jobs.find((candidate) => candidate.id === where.id);
        if (!job) return { count: 0 };
        if (data.status !== undefined) job.status = data.status;
        if (data.errorMessage !== undefined) job.errorMessage = data.errorMessage;
        return { count: 1 };
      },
      findUnique: async ({ where }: any) =>
        state.jobs.find((job) => job.id === where.id) ?? null,
      findMany: async () => [],
    },
    asset: {
      create: async () => {
        throw new Error("unused");
      },
      findMany: async ({ where }: any) =>
        state.assets.filter(
          (asset) => where.id.in.includes(asset.id) && asset.userId === where.userId,
        ),
    },
    jobInputAsset: {
      createMany: async ({ data }: any) => {
        for (const link of data) state.inputLinks.push(link);
        return { count: data.length };
      },
      findMany: async () => [],
    },
  };

  const store = {
    ...tx,
    // Models real transactional semantics: a throw inside the operation rolls
    // every mutation back. Without this the fake would happily report a debit
    // that Postgres would have undone, and the ownership tests below would pass
    // for the wrong reason.
    transaction: async (operation: any) => {
      const snapshot = {
        balance: state.balance,
        jobs: [...state.jobs],
        ledgers: [...state.ledgers],
        inputLinks: [...state.inputLinks],
      };
      try {
        return await operation(tx);
      } catch (error) {
        state.balance = snapshot.balance;
        state.jobs = snapshot.jobs;
        state.ledgers = snapshot.ledgers;
        state.inputLinks = snapshot.inputLinks;
        throw error;
      }
    },
  } as unknown as DatabaseStore;

  const dependencies: SubmitJobDependencies = {
    store,
    enqueue: async (jobId) => {
      if (options.enqueueError) throw options.enqueueError;
      enqueued.push(jobId);
    },
    modelByType: MODELS,
    pricing: PRICING,
    maxInFlight: 3,
  };

  return { dependencies, state, enqueued };
}

// --- Happy path -------------------------------------------------------------

test("submits an image job, debits the flat cost, and enqueues once", async () => {
  const { dependencies, state, enqueued } = harness();

  const result = await submitGenerationJob(
    "user-1",
    { type: "image", prompt: "a neon fox" },
    dependencies,
  );

  assert.equal(result.job.creditsCost, 1);
  assert.equal(result.job.model, MODELS.image);
  assert.equal(state.balance, 99);
  assert.deepEqual(enqueued, [result.job.id]);
});

test("video cost is derived from the requested params, not a flat constant", async () => {
  const { dependencies, state } = harness();

  const result = await submitGenerationJob(
    "user-1",
    {
      type: "video",
      prompt: "orbit",
      params: { resolution: "480p", ratio: "16:9", durationSeconds: 10 },
    },
    dependencies,
  );

  // 480p routes to seedance-2.5 at 5.77/sec: 5.77 * 10s * 0.5 = 28.85 -> 29.
  assert.equal(result.job.creditsCost, 29);
  assert.equal(state.balance, 71);
});

test("the model is taken from server config and never from the request", async () => {
  const { dependencies } = harness();

  await assert.rejects(
    submitGenerationJob(
      "user-1",
      { type: "image", prompt: "x", model: "attacker-chosen-model" },
      dependencies,
    ),
    InvalidJobRequest,
  );
});

// --- Validation -------------------------------------------------------------

test("rejects a malformed request before touching credits", async () => {
  const { dependencies, state } = harness();

  await assert.rejects(
    submitGenerationJob("user-1", { type: "image" }, dependencies),
    InvalidJobRequest,
  );
  assert.equal(state.balance, 100);
  assert.equal(state.jobs.length, 0);
});

test("rejects params the configured model does not support, before charging", async () => {
  const { dependencies, state } = harness();

  // 4K is legal now — it routes to seedance-2.0, which serves 4K but caps at
  // 15s. Asking for 4K at 30s is the combination no configured model can do:
  // the model that reaches 30s stops at 1080p. It must be refused before any
  // credits move, not discovered by the provider after the user is charged.
  await assert.rejects(
    submitGenerationJob(
      "user-1",
      {
        type: "video",
        prompt: "orbit",
        params: { resolution: "4K", ratio: "16:9", durationSeconds: 30 },
      },
      dependencies,
    ),
    InvalidJobRequest,
  );
  assert.equal(state.balance, 100);
  assert.equal(state.jobs.length, 0);
});

// --- Credit and concurrency guards ------------------------------------------

test("refuses to submit when the balance is below the computed cost", async () => {
  const { dependencies, state } = harness({ balance: 13 });

  await assert.rejects(
    submitGenerationJob("user-1", { type: "video", prompt: "orbit" }, dependencies),
    InsufficientCreditsError,
  );
  assert.equal(state.balance, 13);
  assert.equal(state.jobs.length, 0);
});

test("refuses to submit past the in-flight cap", async () => {
  const { dependencies, state } = harness({ inFlightJobs: 3 });

  await assert.rejects(
    submitGenerationJob("user-1", { type: "image", prompt: "x" }, dependencies),
    InFlightLimitError,
  );
  assert.equal(state.balance, 100);
});

// --- Input assets -----------------------------------------------------------

function asset(id: string, userId: string): AssetRecord {
  return {
    id,
    jobId: "earlier-job",
    userId,
    type: "image",
    storageUrl: `tos://bucket/${id}.png`,
    thumbnailUrl: null,
    createdAt: FIXED_TIME,
  };
}

test("links input assets the caller owns", async () => {
  const { dependencies, state } = harness({ assets: [asset("mine", "user-1")] });

  await submitGenerationJob(
    "user-1",
    {
      type: "video",
      prompt: "animate",
      inputAssets: [{ assetId: "mine", role: "first_frame" }],
    },
    dependencies,
  );

  assert.equal(state.inputLinks.length, 1);
  assert.equal(state.inputLinks[0]?.assetId, "mine");
});

test("refuses an input asset owned by another user and charges nothing", async () => {
  const { dependencies, state } = harness({ assets: [asset("theirs", "user-2")] });

  await assert.rejects(
    submitGenerationJob(
      "user-1",
      {
        type: "video",
        prompt: "animate",
        inputAssets: [{ assetId: "theirs", role: "first_frame" }],
      },
      dependencies,
    ),
    InputAssetNotOwnedError,
  );
  assert.equal(state.balance, 100);
  assert.equal(state.inputLinks.length, 0);
});

// --- Compensation -----------------------------------------------------------

test("refunds when enqueueing fails, so a user is never charged for work that cannot run", async () => {
  const { dependencies, state } = harness({
    enqueueError: new Error("redis is down"),
  });

  await assert.rejects(
    submitGenerationJob("user-1", { type: "image", prompt: "x" }, dependencies),
    /redis is down/,
  );

  // Debited 1, then refunded 1.
  assert.equal(state.balance, 100);
  assert.equal(state.jobs[0]?.status, "failed");
  assert.deepEqual(
    state.ledgers.map((entry) => entry.delta),
    [-1, 1],
  );
});
