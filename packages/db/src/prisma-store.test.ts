import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";

import { findStaleQueuedJobs, submitJob } from "./jobs.js";
import { createPrismaStore } from "./prisma-store.js";

const JOB_ROW = {
  id: "job-1",
  userId: "user-1",
  type: "video",
  model: "dreamina-seedance-2-0-fast-260128",
  status: "queued",
  inputParams: { prompt: "orbital sunrise" },
  externalTaskId: null,
  errorMessage: null,
  creditsCost: 14,
  createdAt: new Date("2026-08-27T00:00:00.000Z"),
  updatedAt: new Date("2026-08-27T00:00:00.000Z"),
};

function unusedDelegate(): never {
  throw new Error("unexpected Prisma delegate call");
}

test("Prisma adapter submits with serializable isolation and conditional debit", async () => {
  let transactionOptions: unknown;
  let debitArgs: unknown;
  const transactionClient = {
    user: {
      create: unusedDelegate,
      updateMany: async (args: unknown) => {
        debitArgs = args;
        return { count: 1 };
      },
    },
    creditLedgerEntry: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: "ledger-1",
        ...data,
        createdAt: new Date("2026-08-27T00:00:00.000Z"),
      }),
    },
    job: {
      count: async () => 0,
      create: async () => JOB_ROW,
      updateMany: unusedDelegate,
      findUnique: unusedDelegate,
      findMany: unusedDelegate,
    },
    asset: { create: unusedDelegate },
  };
  const prismaLike = {
    ...transactionClient,
    $transaction: async (
      operation: (tx: typeof transactionClient) => Promise<unknown>,
      options: unknown,
    ) => {
      transactionOptions = options;
      return operation(transactionClient);
    },
  } as unknown as PrismaClient;

  await submitJob(createPrismaStore(prismaLike), {
    userId: "user-1",
    type: "video",
    prompt: "orbital sunrise",
    params: {
      type: "video",
      resolution: "720p",
      ratio: "21:9",
      durationSeconds: 5,
    withAudio: false,
    },
    model: "dreamina-seedance-2-0-fast-260128",
    creditsCost: 14,
    maxInFlight: 3,
  });

  assert.deepEqual(transactionOptions, { isolationLevel: "Serializable" });
  assert.deepEqual(debitArgs, {
    where: { id: "user-1", creditBalance: { gte: 14 } },
    data: { creditBalance: { decrement: 14 } },
  });
});

test("Prisma adapter emits the bounded oldest-first stale queue query", async () => {
  let findManyArgs: unknown;
  const delegates = {
    user: { create: unusedDelegate, updateMany: unusedDelegate },
    creditLedgerEntry: { create: unusedDelegate },
    job: {
      count: unusedDelegate,
      create: unusedDelegate,
      updateMany: unusedDelegate,
      findUnique: unusedDelegate,
      findMany: async (args: unknown) => {
        findManyArgs = args;
        return [JOB_ROW];
      },
    },
    asset: { create: unusedDelegate },
    $transaction: unusedDelegate,
  } as unknown as PrismaClient;
  const cutoff = new Date("2026-08-27T00:01:00.000Z");

  const jobs = await findStaleQueuedJobs(
    createPrismaStore(delegates),
    cutoff,
    25,
  );

  assert.deepEqual(findManyArgs, {
    where: { status: "queued", createdAt: { lte: cutoff } },
    orderBy: { createdAt: "asc" },
    take: 25,
  });
  assert.equal(jobs[0]?.id, "job-1");
});

test("stale queue queries default to at most 100 jobs", async () => {
  let findManyArgs: { take?: number } | undefined;
  const delegates = {
    user: { create: unusedDelegate, updateMany: unusedDelegate },
    creditLedgerEntry: { create: unusedDelegate },
    job: {
      count: unusedDelegate,
      create: unusedDelegate,
      updateMany: unusedDelegate,
      findUnique: unusedDelegate,
      findMany: async (args: { take?: number }) => {
        findManyArgs = args;
        return [];
      },
    },
    asset: { create: unusedDelegate },
    $transaction: unusedDelegate,
  } as unknown as PrismaClient;

  await findStaleQueuedJobs(
    createPrismaStore(delegates),
    new Date("2026-08-27T00:01:00.000Z"),
  );

  assert.equal(findManyArgs?.take, 100);
});

// --- Legacy row normalization -----------------------------------------------
// The migration that introduced generation params was additive and did not
// backfill existing rows, so jobs written before it still store { prompt } with
// no params object. These must keep working rather than fail on params.type.

function legacyJobStore(row: Record<string, unknown>) {
  return createPrismaStore({
    user: { create: unusedDelegate, updateMany: unusedDelegate },
    creditLedgerEntry: { create: unusedDelegate },
    job: {
      count: unusedDelegate,
      create: unusedDelegate,
      updateMany: unusedDelegate,
      findUnique: async () => row,
      findMany: unusedDelegate,
    },
    asset: { create: unusedDelegate, findMany: unusedDelegate },
    jobInputAsset: { createMany: unusedDelegate, findMany: unusedDelegate },
    $transaction: unusedDelegate,
  } as unknown as PrismaClient);
}

test("a legacy video row without params reads back as the old fixed profile", async () => {
  const store = legacyJobStore(JOB_ROW);
  const job = await store.job.findUnique({ where: { id: "job-1" } });

  assert.equal(job?.inputParams.prompt, "orbital sunrise");
  assert.deepEqual(job?.inputParams.params, {
    type: "video",
    resolution: "720p",
    ratio: "21:9",
    durationSeconds: 5,
    withAudio: false,
  });
});

test("a legacy image row without params reads back as 4K", async () => {
  const store = legacyJobStore({
    ...JOB_ROW,
    type: "image",
    inputParams: { prompt: "a fox" },
  });
  const job = await store.job.findUnique({ where: { id: "job-1" } });

  assert.deepEqual(job?.inputParams.params, { type: "image", size: "4K", count: 1 });
});

test("an image row written before batch existed reads back with a count of 1", async () => {
  const store = legacyJobStore({
    ...JOB_ROW,
    type: "image",
    inputParams: { prompt: "a fox", params: { type: "image", size: "2K" } },
  });
  const job = await store.job.findUnique({ where: { id: "job-1" } });

  // Without the backfill this is undefined, and the per-image refund maths at
  // completion divides by it.
  assert.deepEqual(job?.inputParams.params, { type: "image", size: "2K", count: 1 });
});

test("a legacy voice row preserves its top-level voiceStyle", async () => {
  const store = legacyJobStore({
    ...JOB_ROW,
    type: "voice",
    inputParams: { prompt: "hello", voiceStyle: "expressive" },
  });
  const job = await store.job.findUnique({ where: { id: "job-1" } });

  assert.deepEqual(job?.inputParams.params, {
    type: "voice",
    style: "expressive",
  });
});

test("a row that already has params is passed through untouched", async () => {
  const store = legacyJobStore({
    ...JOB_ROW,
    inputParams: {
      prompt: "orbit",
      params: {
        type: "video",
        resolution: "1080p",
        ratio: "16:9",
        durationSeconds: 12,
    withAudio: false,
      },
    },
  });
  const job = await store.job.findUnique({ where: { id: "job-1" } });

  assert.deepEqual(job?.inputParams.params, {
    type: "video",
    resolution: "1080p",
    ratio: "16:9",
    durationSeconds: 12,
    withAudio: false,
  });
});
