import assert from "node:assert/strict";
import test from "node:test";

import {
  directorReducer,
  INITIAL_DIRECTOR_STATE,
  type DirectorShot,
  type DirectorState,
} from "./director-state.js";

const SAMPLE_SHOT: DirectorShot = {
  description: "A lone figure walks across a desert",
  cameraPreset: "aerial",
  cameraLabel: "Aerial / Drone",
  lensLabel: "Wide 24mm",
  durationSeconds: 5,
  prompt: "A lone figure walks across a desert, sweeping aerial drone shot",
};

test("starts idle with an empty brief", () => {
  assert.equal(INITIAL_DIRECTOR_STATE.phase, "idle");
  assert.equal(INITIAL_DIRECTOR_STATE.brief, "");
});

test("set brief updates only the brief field", () => {
  const next = directorReducer(INITIAL_DIRECTOR_STATE, {
    type: "SET_BRIEF",
    brief: "a car chase through neon streets",
  });
  assert.equal(next.brief, "a car chase through neon streets");
  assert.equal(next.phase, "idle");
});

test("plan start moves to planning and clears prior results", () => {
  const state: DirectorState = {
    ...INITIAL_DIRECTOR_STATE,
    phase: "failed",
    errorMessage: "old error",
    shots: [SAMPLE_SHOT],
  };
  const next = directorReducer(state, { type: "PLAN_START" });
  assert.equal(next.phase, "planning");
  assert.equal(next.errorMessage, null);
  assert.deepEqual(next.shots, []);
});

test("plan success stores the returned shots", () => {
  const state: DirectorState = { ...INITIAL_DIRECTOR_STATE, phase: "planning" };
  const next = directorReducer(state, { type: "PLAN_SUCCESS", shots: [SAMPLE_SHOT], lookLabel: "Golden Hour" });
  assert.equal(next.phase, "planned");
  assert.deepEqual(next.shots, [SAMPLE_SHOT]);
});

test("plan error stores a message and clears shots", () => {
  const state: DirectorState = { ...INITIAL_DIRECTOR_STATE, phase: "planning" };
  const next = directorReducer(state, { type: "PLAN_ERROR", message: "brief must not be empty" });
  assert.equal(next.phase, "failed");
  assert.equal(next.errorMessage, "brief must not be empty");
  assert.deepEqual(next.shots, []);
});

test("the plan's look is stored once and cleared on replan", () => {
  const planned = directorReducer(INITIAL_DIRECTOR_STATE, {
    type: "PLAN_SUCCESS",
    shots: [SAMPLE_SHOT],
    lookLabel: "Film Noir",
  });
  assert.equal(planned.lookLabel, "Film Noir");

  // A new plan must not display the previous plan's grade while it loads.
  const replanning = directorReducer(planned, { type: "PLAN_START" });
  assert.equal(replanning.lookLabel, null);
});
