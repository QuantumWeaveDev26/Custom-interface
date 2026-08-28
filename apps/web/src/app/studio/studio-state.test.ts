import assert from "node:assert/strict";
import test from "node:test";

import {
  INITIAL_STUDIO_STATE,
  studioReducer,
  type StudioState,
} from "./studio-state.js";

test("starts idle", () => {
  assert.equal(INITIAL_STUDIO_STATE.phase, "idle");
});

test("submit start moves idle to submitting and clears prior error/assets", () => {
  const state: StudioState = {
    ...INITIAL_STUDIO_STATE,
    errorMessage: "old error",
    assets: [{ id: "a1", type: "image", url: "/api/assets/a1" }],
  };
  const next = studioReducer(state, { type: "SUBMIT_START" });
  assert.equal(next.phase, "submitting");
  assert.equal(next.errorMessage, null);
  assert.deepEqual(next.assets, []);
});

test("job queued moves submitting to queued with jobId", () => {
  const state: StudioState = { ...INITIAL_STUDIO_STATE, phase: "submitting" };
  const next = studioReducer(state, { type: "JOB_QUEUED", jobId: "job-1" });
  assert.equal(next.phase, "queued");
  assert.equal(next.jobId, "job-1");
});

test("status event processing moves queued to processing", () => {
  const state: StudioState = { ...INITIAL_STUDIO_STATE, phase: "queued", jobId: "job-1" };
  const next = studioReducer(state, { type: "STATUS_EVENT", status: "processing" });
  assert.equal(next.phase, "processing");
});

test("status event complete carries assets", () => {
  const state: StudioState = { ...INITIAL_STUDIO_STATE, phase: "processing", jobId: "job-1" };
  const next = studioReducer(state, {
    type: "STATUS_EVENT",
    status: "complete",
    assets: [{ id: "a1", type: "image", url: "/api/assets/a1" }],
  });
  assert.equal(next.phase, "complete");
  assert.deepEqual(next.assets, [{ id: "a1", type: "image", url: "/api/assets/a1" }]);
});

test("status event failed carries a safe error message", () => {
  const state: StudioState = { ...INITIAL_STUDIO_STATE, phase: "processing", jobId: "job-1" };
  const next = studioReducer(state, {
    type: "STATUS_EVENT",
    status: "failed",
    errorMessage: "Generation was rejected by content safety filters.",
  });
  assert.equal(next.phase, "failed");
  assert.equal(next.errorMessage, "Generation was rejected by content safety filters.");
});

test("submit error returns to idle with a message", () => {
  const state: StudioState = { ...INITIAL_STUDIO_STATE, phase: "submitting" };
  const next = studioReducer(state, { type: "SUBMIT_ERROR", message: "Insufficient credits" });
  assert.equal(next.phase, "idle");
  assert.equal(next.errorMessage, "Insufficient credits");
});

test("mode switch resets phase/job/assets but preserves prompt text", () => {
  const state: StudioState = {
    mode: "image",
    prompt: "a neon fox",
    voiceStyle: "standard",
    phase: "complete",
    jobId: "job-1",
    errorMessage: null,
    assets: [{ id: "a1", type: "image", url: "/api/assets/a1" }],
  };
  const next = studioReducer(state, { type: "SET_MODE", mode: "video" });
  assert.equal(next.mode, "video");
  assert.equal(next.prompt, "a neon fox");
  assert.equal(next.phase, "idle");
  assert.equal(next.jobId, null);
  assert.deepEqual(next.assets, []);
});

test("voice mode completes with an audio asset", () => {
  const state: StudioState = { ...INITIAL_STUDIO_STATE, mode: "voice", phase: "processing" };
  const next = studioReducer(state, {
    type: "STATUS_EVENT",
    status: "complete",
    assets: [{ id: "a2", type: "audio", url: "/api/assets/a2" }],
  });
  assert.equal(next.phase, "complete");
  assert.deepEqual(next.assets, [{ id: "a2", type: "audio", url: "/api/assets/a2" }]);
});

test("set voice style updates only the voiceStyle field", () => {
  const next = studioReducer(INITIAL_STUDIO_STATE, {
    type: "SET_VOICE_STYLE",
    voiceStyle: "expressive",
  });
  assert.equal(next.voiceStyle, "expressive");
  assert.equal(next.phase, "idle");
});

test("mode switch resets voiceStyle to standard", () => {
  const state: StudioState = {
    ...INITIAL_STUDIO_STATE,
    mode: "voice",
    voiceStyle: "expressive",
    phase: "complete",
  };
  const next = studioReducer(state, { type: "SET_MODE", mode: "image" });
  assert.equal(next.voiceStyle, "standard");
});

test("set prompt updates only the prompt field", () => {
  const next = studioReducer(INITIAL_STUDIO_STATE, {
    type: "SET_PROMPT",
    prompt: "orbital sunrise",
  });
  assert.equal(next.prompt, "orbital sunrise");
  assert.equal(next.phase, "idle");
});
