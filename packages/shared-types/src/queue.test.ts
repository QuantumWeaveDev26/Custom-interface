import assert from "node:assert/strict";
import test from "node:test";

import { GENERATION_QUEUE_NAME, generationJobOptions } from "./queue.js";

test("generation jobs explicitly disable automatic retries", () => {
  assert.deepEqual(generationJobOptions("job-1"), { jobId: "job-1", attempts: 1 });
});

test("uses one stable Phase 1 queue name", () => {
  assert.equal(GENERATION_QUEUE_NAME, "generation");
});
