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
    ...INITIAL_STUDIO_STATE,
    mode: "image",
    prompt: "a neon fox",
    phase: "complete",
    jobId: "job-1",
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

test("generation params default to the previously hardcoded profiles", () => {
  assert.equal(INITIAL_STUDIO_STATE.imageSize, "4K");
  assert.equal(INITIAL_STUDIO_STATE.resolution, "720p");
  assert.equal(INITIAL_STUDIO_STATE.ratio, "21:9");
  assert.equal(INITIAL_STUDIO_STATE.durationSeconds, 5);
});

test("each generation param setter updates only its own field", () => {
  let next = studioReducer(INITIAL_STUDIO_STATE, { type: "SET_IMAGE_SIZE", imageSize: "1K" });
  assert.equal(next.imageSize, "1K");
  assert.equal(next.resolution, "720p");

  next = studioReducer(INITIAL_STUDIO_STATE, { type: "SET_RESOLUTION", resolution: "1080p" });
  assert.equal(next.resolution, "1080p");
  assert.equal(next.ratio, "21:9");

  next = studioReducer(INITIAL_STUDIO_STATE, { type: "SET_RATIO", ratio: "9:16" });
  assert.equal(next.ratio, "9:16");
  assert.equal(next.durationSeconds, 5);

  next = studioReducer(INITIAL_STUDIO_STATE, { type: "SET_DURATION", durationSeconds: 20 });
  assert.equal(next.durationSeconds, 20);
  assert.equal(next.resolution, "720p");
});

test("mode switch resets generation params but preserves the prompt", () => {
  const state: StudioState = {
    ...INITIAL_STUDIO_STATE,
    mode: "video",
    prompt: "orbital sunrise",
    resolution: "1080p",
    ratio: "9:16",
    durationSeconds: 25,
  };
  const next = studioReducer(state, { type: "SET_MODE", mode: "image" });

  assert.equal(next.prompt, "orbital sunrise");
  assert.equal(next.resolution, "720p");
  assert.equal(next.ratio, "21:9");
  assert.equal(next.durationSeconds, 5);
});

test("set prompt updates only the prompt field", () => {
  const next = studioReducer(INITIAL_STUDIO_STATE, {
    type: "SET_PROMPT",
    prompt: "orbital sunrise",
  });
  assert.equal(next.prompt, "orbital sunrise");
  assert.equal(next.phase, "idle");
});

test("first frame selection is independent of other params", () => {
  const next = studioReducer(INITIAL_STUDIO_STATE, {
    type: "SET_FIRST_FRAME",
    assetId: "asset-1",
  });
  assert.equal(next.firstFrameAssetId, "asset-1");
  assert.equal(next.resolution, "720p");
  assert.equal(next.prompt, "");
});

test("first frame can be cleared back to text-to-video", () => {
  const selected = studioReducer(INITIAL_STUDIO_STATE, {
    type: "SET_FIRST_FRAME",
    assetId: "asset-1",
  });
  const cleared = studioReducer(selected, { type: "SET_FIRST_FRAME", assetId: null });
  assert.equal(cleared.firstFrameAssetId, null);
});

test("mode switch clears the selected first frame", () => {
  const state: StudioState = {
    ...INITIAL_STUDIO_STATE,
    mode: "video",
    firstFrameAssetId: "asset-1",
  };
  // Carrying an image-to-video selection into image or voice mode would submit
  // an input asset the job type does not accept.
  const next = studioReducer(state, { type: "SET_MODE", mode: "image" });
  assert.equal(next.firstFrameAssetId, null);
});

// --- Reference images (C4) --------------------------------------------------

test("references accumulate in selection order", () => {
  let state = studioReducer(INITIAL_STUDIO_STATE, {
    type: "TOGGLE_REFERENCE",
    assetId: "a",
  });
  state = studioReducer(state, { type: "TOGGLE_REFERENCE", assetId: "b" });
  state = studioReducer(state, { type: "TOGGLE_REFERENCE", assetId: "c" });

  // Order is what the prompt addresses as "image 1", "image 2", "image 3".
  assert.deepEqual(state.referenceAssetIds, ["a", "b", "c"]);
});

test("toggling a reference off removes it and preserves the rest in order", () => {
  let state = INITIAL_STUDIO_STATE;
  for (const assetId of ["a", "b", "c"]) {
    state = studioReducer(state, { type: "TOGGLE_REFERENCE", assetId });
  }
  state = studioReducer(state, { type: "TOGGLE_REFERENCE", assetId: "b" });

  assert.deepEqual(state.referenceAssetIds, ["a", "c"]);
});

test("re-adding a removed reference puts it at the end, not its old slot", () => {
  let state = INITIAL_STUDIO_STATE;
  for (const assetId of ["a", "b"]) {
    state = studioReducer(state, { type: "TOGGLE_REFERENCE", assetId });
  }
  state = studioReducer(state, { type: "TOGGLE_REFERENCE", assetId: "a" });
  state = studioReducer(state, { type: "TOGGLE_REFERENCE", assetId: "a" });

  // Matches what the numbered badges show the user.
  assert.deepEqual(state.referenceAssetIds, ["b", "a"]);
});

test("mode switch clears selected references", () => {
  const state: StudioState = {
    ...INITIAL_STUDIO_STATE,
    referenceAssetIds: ["a", "b"],
  };
  const next = studioReducer(state, { type: "SET_MODE", mode: "video" });
  assert.deepEqual(next.referenceAssetIds, []);
});

test("loading a character replaces the selection rather than merging", () => {
  const state: StudioState = {
    ...INITIAL_STUDIO_STATE,
    referenceAssetIds: ["old-1", "old-2"],
  };
  // Merging would silently give a different set than the character defines,
  // and the numbered badges would stop matching the saved order.
  const next = studioReducer(state, {
    type: "SET_REFERENCES",
    assetIds: ["char-a", "char-b"],
  });
  assert.deepEqual(next.referenceAssetIds, ["char-a", "char-b"]);
});

test("loading a character preserves its saved order", () => {
  const next = studioReducer(INITIAL_STUDIO_STATE, {
    type: "SET_REFERENCES",
    assetIds: ["c", "a", "b"],
  });
  assert.deepEqual(next.referenceAssetIds, ["c", "a", "b"]);
});

// --- Last frame / keyframe transitions --------------------------------------

test("first and last frames are independent slots", () => {
  let state = studioReducer(INITIAL_STUDIO_STATE, {
    type: "SET_FIRST_FRAME",
    assetId: "start",
  });
  state = studioReducer(state, { type: "SET_LAST_FRAME", assetId: "end" });

  assert.equal(state.firstFrameAssetId, "start");
  assert.equal(state.lastFrameAssetId, "end");
});

test("mode switch clears the selected last frame", () => {
  const state: StudioState = {
    ...INITIAL_STUDIO_STATE,
    mode: "video",
    lastFrameAssetId: "end",
  };
  const next = studioReducer(state, { type: "SET_MODE", mode: "image" });
  assert.equal(next.lastFrameAssetId, null);
});

test("adaptive ratio survives while any keyframe remains", () => {
  let state: StudioState = {
    ...INITIAL_STUDIO_STATE,
    mode: "video",
    firstFrameAssetId: "start",
    lastFrameAssetId: "end",
    ratio: "adaptive",
  };
  state = studioReducer(state, { type: "SET_FIRST_FRAME", assetId: null });
  assert.equal(state.ratio, "adaptive");
});

test("clearing the last keyframe drops adaptive back to the default ratio", () => {
  // The server rejects adaptive with no input asset, so leaving it selected
  // would make the form unsubmittable with no visible cause.
  const state: StudioState = {
    ...INITIAL_STUDIO_STATE,
    mode: "video",
    firstFrameAssetId: "start",
    ratio: "adaptive",
  };
  const next = studioReducer(state, { type: "SET_FIRST_FRAME", assetId: null });
  assert.equal(next.ratio, INITIAL_STUDIO_STATE.ratio);
});

test("a non-adaptive ratio is left alone when keyframes are cleared", () => {
  const state: StudioState = {
    ...INITIAL_STUDIO_STATE,
    mode: "video",
    firstFrameAssetId: "start",
    ratio: "9:16",
  };
  const next = studioReducer(state, { type: "SET_FIRST_FRAME", assetId: null });
  assert.equal(next.ratio, "9:16");
});

// --- Source clips (C6) ------------------------------------------------------

test("source clips accumulate in selection order", () => {
  let state = INITIAL_STUDIO_STATE;
  for (const assetId of ["a", "b", "c"]) {
    state = studioReducer(state, { type: "TOGGLE_SOURCE_VIDEO", assetId });
  }
  // Order is what the prompt addresses as "[Video 1]", "[Video 2]".
  assert.deepEqual(state.sourceVideoAssetIds, ["a", "b", "c"]);
});

test("toggling a clip off preserves the order of the rest", () => {
  let state = INITIAL_STUDIO_STATE;
  for (const assetId of ["a", "b", "c"]) {
    state = studioReducer(state, { type: "TOGGLE_SOURCE_VIDEO", assetId });
  }
  state = studioReducer(state, { type: "TOGGLE_SOURCE_VIDEO", assetId: "b" });
  assert.deepEqual(state.sourceVideoAssetIds, ["a", "c"]);
});

test("mode switch clears selected clips", () => {
  const state: StudioState = {
    ...INITIAL_STUDIO_STATE,
    mode: "video",
    sourceVideoAssetIds: ["a"],
  };
  const next = studioReducer(state, { type: "SET_MODE", mode: "image" });
  assert.deepEqual(next.sourceVideoAssetIds, []);
});

// --- Cinema presets (C5) ----------------------------------------------------

test("camera moves accumulate in click order", () => {
  let state = studioReducer(INITIAL_STUDIO_STATE, {
    type: "TOGGLE_CAMERA_PRESET",
    presetId: "dolly-in",
  });
  state = studioReducer(state, { type: "TOGGLE_CAMERA_PRESET", presetId: "tilt-up" });

  // "dolly in, then tilt up" is a sequence; the order is the shot.
  assert.deepEqual(state.cameraPresetIds, ["dolly-in", "tilt-up"]);
});

test("toggling a camera move off leaves the rest in order", () => {
  let state = INITIAL_STUDIO_STATE;
  for (const presetId of ["dolly-in", "tilt-up", "orbit"] as const) {
    state = studioReducer(state, { type: "TOGGLE_CAMERA_PRESET", presetId });
  }
  state = studioReducer(state, { type: "TOGGLE_CAMERA_PRESET", presetId: "tilt-up" });

  assert.deepEqual(state.cameraPresetIds, ["dolly-in", "orbit"]);
});

test("lens and look are single-choice and clearable", () => {
  let state = studioReducer(INITIAL_STUDIO_STATE, {
    type: "SET_LENS_PRESET",
    presetId: "portrait",
  });
  assert.equal(state.lensPresetId, "portrait");

  state = studioReducer(state, { type: "SET_LENS_PRESET", presetId: "macro" });
  assert.equal(state.lensPresetId, "macro");

  state = studioReducer(state, { type: "SET_LENS_PRESET", presetId: null });
  assert.equal(state.lensPresetId, null);

  state = studioReducer(state, { type: "SET_LOOK_PRESET", presetId: "film-noir" });
  assert.equal(state.lookPresetId, "film-noir");
  assert.equal(state.lensPresetId, null);
});

test("mode switch clears every preset axis", () => {
  const state: StudioState = {
    ...INITIAL_STUDIO_STATE,
    mode: "video",
    cameraPresetIds: ["orbit"],
    lensPresetId: "anamorphic",
    lookPresetId: "neon-night",
  };
  const next = studioReducer(state, { type: "SET_MODE", mode: "voice" });

  assert.deepEqual(next.cameraPresetIds, []);
  assert.equal(next.lensPresetId, null);
  assert.equal(next.lookPresetId, null);
});

// --- Batch image generation (C9) --------------------------------------------

test("image count defaults to one", () => {
  assert.equal(INITIAL_STUDIO_STATE.imageCount, 1);
});

test("adding references clamps a count that no longer fits the ceiling", () => {
  // References and generated images share a ceiling of 15.
  let state: StudioState = { ...INITIAL_STUDIO_STATE, imageCount: 15 };
  state = studioReducer(state, { type: "TOGGLE_REFERENCE", assetId: "a" });
  assert.equal(state.imageCount, 14);

  state = studioReducer(state, { type: "TOGGLE_REFERENCE", assetId: "b" });
  assert.equal(state.imageCount, 13);
});

test("removing a reference does not push the count back up on its own", () => {
  let state: StudioState = { ...INITIAL_STUDIO_STATE, imageCount: 15 };
  state = studioReducer(state, { type: "TOGGLE_REFERENCE", assetId: "a" });
  state = studioReducer(state, { type: "TOGGLE_REFERENCE", assetId: "a" });

  // Raising it again silently would be the app choosing to spend more credits
  // than the user last chose to.
  assert.equal(state.imageCount, 14);
});

test("loading a character clamps the count too", () => {
  const state: StudioState = { ...INITIAL_STUDIO_STATE, imageCount: 15 };
  const next = studioReducer(state, {
    type: "SET_REFERENCES",
    assetIds: ["a", "b", "c"],
  });
  assert.equal(next.imageCount, 12);
});

test("mode switch resets the count", () => {
  const state: StudioState = { ...INITIAL_STUDIO_STATE, imageCount: 8 };
  const next = studioReducer(state, { type: "SET_MODE", mode: "video" });
  assert.equal(next.imageCount, 1);
});
