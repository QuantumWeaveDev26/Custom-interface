import assert from "node:assert/strict";
import test from "node:test";

import type { JobRecord } from "@creative-ai/db";

import type { RecoveryQueue } from "./recovery.js";
import { runQueuedJobRecovery } from "./recovery.js";

const NOW = new Date("2026-08-27T12:00:00.000Z");

function queuedJob(id: string, createdAt: Date): JobRecord {
  return {
    id,
    userId: "user-1",
    type: "image",
    model: "seedream-5-0-lite-260128",
    status: "queued",
    inputParams: {
      prompt: "test prompt",
      params: { type: "image", size: "4K", count: 1 },
    },
    externalTaskId: null,
    chainProgress: null,
    errorMessage: null,
    creditsCost: 1,
    createdAt,
    updatedAt: createdAt,
  };
}

test("recovery inspects a bounded stale batch and re-enqueues only missing jobs", async () => {
  const staleJobs = [
    queuedJob("missing-1", new Date("2026-08-27T11:58:00.000Z")),
    queuedJob("present", new Date("2026-08-27T11:58:30.000Z")),
    queuedJob("missing-2", new Date("2026-08-27T11:59:00.000Z")),
  ];
  const queries: Array<{ cutoff: Date; limit: number }> = [];
  const additions: unknown[] = [];
  const queue: RecoveryQueue = {
    getJob: async (jobId) => (jobId === "present" ? { id: jobId } : null),
    add: async (name, data, options) => {
      additions.push({ name, data, options });
      return {};
    },
  };

  const result = await runQueuedJobRecovery(
    {
      findStaleQueuedJobs: async (cutoff, limit) => {
        queries.push({ cutoff, limit });
        return staleJobs;
      },
      queue,
    },
    NOW,
  );

  assert.deepEqual(queries, [
    { cutoff: new Date("2026-08-27T11:59:00.000Z"), limit: 100 },
  ]);
  assert.deepEqual(additions, [
    {
      name: "generate",
      data: { jobId: "missing-1" },
      options: { jobId: "missing-1", attempts: 1 },
    },
    {
      name: "generate",
      data: { jobId: "missing-2" },
      options: { jobId: "missing-2", attempts: 1 },
    },
  ]);
  assert.deepEqual(result, { inspected: 3, requeued: 2, errors: 0 });
});

test("recovery logs transient Redis errors and leaves queued jobs for the next sweep", async () => {
  const logged: unknown[] = [];
  let additions = 0;

  const result = await runQueuedJobRecovery(
    {
      findStaleQueuedJobs: async () => [
        queuedJob("redis-error", new Date("2026-08-27T11:00:00.000Z")),
      ],
      queue: {
        getJob: async () => {
          throw new Error("Redis unavailable");
        },
        add: async () => {
          additions += 1;
          return {};
        },
      },
      logError: (error, jobId) => logged.push({ error, jobId }),
    },
    NOW,
  );

  assert.equal(additions, 0);
  assert.equal(logged.length, 1);
  assert.equal((logged[0] as { jobId: string }).jobId, "redis-error");
  assert.match(
    String((logged[0] as { error: Error }).error),
    /Redis unavailable/,
  );
  assert.deepEqual(result, { inspected: 1, requeued: 0, errors: 1 });
});

test("recovery handles an empty stale batch", async () => {
  let queueCalls = 0;

  const result = await runQueuedJobRecovery(
    {
      findStaleQueuedJobs: async () => [],
      queue: {
        getJob: async () => {
          queueCalls += 1;
          return null;
        },
        add: async () => {
          queueCalls += 1;
          return {};
        },
      },
    },
    NOW,
  );

  assert.equal(queueCalls, 0);
  assert.deepEqual(result, { inspected: 0, requeued: 0, errors: 0 });
});

