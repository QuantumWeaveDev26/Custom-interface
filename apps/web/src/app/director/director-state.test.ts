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
  lensPreset: "standard" as const,
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
  const next = directorReducer(state, { type: "PLAN_SUCCESS", shots: [SAMPLE_SHOT], lookLabel: "Golden Hour", lookPreset: "golden-hour" });
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
    lookPreset: "neon-night" as const,
    shots: [SAMPLE_SHOT],
    lookLabel: "Film Noir",
  });
  assert.equal(planned.lookLabel, "Film Noir");

  // A new plan must not display the previous plan's grade while it loads.
  const replanning = directorReducer(planned, { type: "PLAN_START" });
  assert.equal(replanning.lookLabel, null);
});

test("rewriting a shot rewrites what will actually be generated", () => {
  const planned = directorReducer(
    { ...INITIAL_DIRECTOR_STATE, phase: "planning" },
    {
      type: "PLAN_SUCCESS",
      shots: [SAMPLE_SHOT],
      lookLabel: "Neon Night",
      lookPreset: "neon-night",
    },
  );

  const edited = directorReducer(planned, {
    type: "EDIT_SHOT",
    index: 0,
    description: "The vendor closes the shutters and walks away",
  });

  // The description changing is the easy half. The prompt is what reaches the
  // model, so an edit that left it alone would show the new words and generate
  // the old shot.
  assert.equal(
    edited.shots[0]?.description,
    "The vendor closes the shutters and walks away",
  );
  assert.match(edited.shots[0]?.prompt ?? "", /closes the shutters/);
  assert.doesNotMatch(edited.shots[0]?.prompt ?? "", /SAMPLE|sunrise/i);

  // And the shot keeps its own camera and lens and the film's one grade —
  // rewriting a line is not re-planning the film.
  assert.equal(edited.shots[0]?.cameraPreset, SAMPLE_SHOT.cameraPreset);
  assert.equal(edited.shots[0]?.lensPreset, SAMPLE_SHOT.lensPreset);
  assert.notEqual(edited.shots[0]?.prompt, edited.shots[0]?.description);
});

test("editing one shot leaves the others untouched", () => {
  const planned = directorReducer(
    { ...INITIAL_DIRECTOR_STATE, phase: "planning" },
    {
      type: "PLAN_SUCCESS",
      shots: [SAMPLE_SHOT, { ...SAMPLE_SHOT, description: "second shot" }],
      lookLabel: "Neon Night",
      lookPreset: "neon-night",
    },
  );

  const edited = directorReducer(planned, {
    type: "EDIT_SHOT",
    index: 0,
    description: "rewritten",
  });

  assert.equal(edited.shots[1]?.description, "second shot");
  assert.equal(edited.shots[1]?.prompt, planned.shots[1]?.prompt);
});
