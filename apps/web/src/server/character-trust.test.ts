import assert from "node:assert/strict";
import test from "node:test";

import { characterTrust } from "./character-trust.js";

const NOW = new Date("2026-09-01T12:00:00.000Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

test("a character built from generated images is usable inside the window", () => {
  assert.deepEqual(
    characterTrust([{ jobId: "job-1", createdAt: daysAgo(3) }], NOW),
    { state: "usable", daysLeft: 27 },
  );
});

test("a character warns before it expires, not after", () => {
  // The point of warning at all is that regenerating takes a job and a wait.
  // A notice on the day it stops working is a notice too late.
  assert.deepEqual(
    characterTrust([{ jobId: "job-1", createdAt: daysAgo(27) }], NOW),
    { state: "expiring", daysLeft: 3 },
  );
});

test("past thirty days the provider stops trusting it", () => {
  assert.deepEqual(
    characterTrust([{ jobId: "job-1", createdAt: daysAgo(31) }], NOW),
    { state: "expired" },
  );
});

test("a character is only as old as its oldest reference", () => {
  // The whole job is rejected if any single input fails, so the freshest image
  // does not rescue the set.
  assert.deepEqual(
    characterTrust(
      [
        { jobId: "job-1", createdAt: daysAgo(1) },
        { jobId: "job-2", createdAt: daysAgo(40) },
      ],
      NOW,
    ),
    { state: "expired" },
  );
});

test("one uploaded photograph makes the whole character untrusted", () => {
  // This is the case that costs a user real money if it is not caught here:
  // the provider rejects it after the credits are spent and the wait is over.
  assert.deepEqual(
    characterTrust(
      [
        { jobId: "job-1", createdAt: daysAgo(1) },
        { jobId: null, createdAt: daysAgo(1) },
      ],
      NOW,
    ),
    { state: "untrusted" },
  );
});

test("a character with no references is not usable", () => {
  assert.deepEqual(characterTrust([], NOW), { state: "untrusted" });
});
