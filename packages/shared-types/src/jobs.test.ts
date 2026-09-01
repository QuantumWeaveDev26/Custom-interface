import assert from "node:assert/strict";
import test from "node:test";

import {
  AUDIO_GENERATION_PROFILE,
  IMAGE_OUTPUT_PROFILE,
  InvalidJobRequest,
  JobStatus,
  VOICE_PROFILE,
  assertParamsSupportedByModel,
  parseSubmitJobRequest,
} from "./jobs.js";
import {
  DEFAULT_IMAGE_PARAMS,
  DEFAULT_VIDEO_PARAMS,
  DEFAULT_VOICE_PARAMS,
} from "./generation.js";

// --- Backward compatibility -------------------------------------------------
// A request with no params must behave exactly as it did when the profiles were
// hardcoded. This is the guard against A2 silently changing what existing
// clients get.

test("omitting params yields the previous hardcoded profile values", () => {
  const image = parseSubmitJobRequest({ type: "image", prompt: "a fox" });
  assert.deepEqual(image.params, { type: "image", size: "4K", count: 1 });

  const video = parseSubmitJobRequest({ type: "video", prompt: "a fox" });
  assert.deepEqual(video.params, {
    type: "video",
    resolution: "720p",
    ratio: "21:9",
    durationSeconds: 5,
    // Sound is on unless a take asks for silence — the provider returns audio
    // whether or not the request mentions it.
    withAudio: true,
  });

  const voice = parseSubmitJobRequest({ type: "voice", prompt: "hello" });
  assert.deepEqual(voice.params, { type: "voice", style: "standard" });
});

test("defaults match the exported DEFAULT_* constants", () => {
  assert.deepEqual(
    parseSubmitJobRequest({ type: "image", prompt: "x" }).params,
    DEFAULT_IMAGE_PARAMS,
  );
  assert.deepEqual(
    parseSubmitJobRequest({ type: "video", prompt: "x" }).params,
    DEFAULT_VIDEO_PARAMS,
  );
  assert.deepEqual(
    parseSubmitJobRequest({ type: "voice", prompt: "x" }).params,
    DEFAULT_VOICE_PARAMS,
  );
});

test("omitting inputAssets yields an empty list, never undefined", () => {
  assert.deepEqual(parseSubmitJobRequest({ type: "image", prompt: "x" }).inputAssets, []);
});

// --- Core request validation ------------------------------------------------

test("trims whitespace from prompts", () => {
  assert.equal(
    parseSubmitJobRequest({ type: "image", prompt: "  neon portrait  " }).prompt,
    "neon portrait",
  );
});

test("rejects values that are not plain request objects", () => {
  class RequestBody {
    type = "image";
    prompt = "portrait";
  }
  for (const value of [null, undefined, "prompt", 42, [], new Date(), new RequestBody()]) {
    assert.throws(() => parseSubmitJobRequest(value), InvalidJobRequest);
  }
});

test("rejects server-controlled fields at the top level", () => {
  for (const field of ["model", "creditsCost", "userId", "status"]) {
    assert.throws(
      () => parseSubmitJobRequest({ type: "video", prompt: "orbit", [field]: "unsafe" }),
      InvalidJobRequest,
      `${field} must not be accepted`,
    );
  }
});

test("rejects generation types outside the supported set", () => {
  for (const type of ["avatar", "director", "voice_clone", "", 1, null]) {
    assert.throws(() => parseSubmitJobRequest({ type, prompt: "hello" }), InvalidJobRequest);
  }
});

test("rejects non-string, empty, and over-limit prompts", () => {
  for (const prompt of [null, 1, {}, [], true, "", "   ", "x".repeat(2001)]) {
    assert.throws(() => parseSubmitJobRequest({ type: "image", prompt }), InvalidJobRequest);
  }
});

test("accepts a prompt at the 2000-character boundary", () => {
  const prompt = "x".repeat(2000);
  assert.equal(parseSubmitJobRequest({ type: "image", prompt }).prompt, prompt);
});

// --- Generation params ------------------------------------------------------

test("accepts valid video params and preserves them", () => {
  const parsed = parseSubmitJobRequest({
    type: "video",
    prompt: "orbit",
    params: { resolution: "1080p", ratio: "16:9", durationSeconds: 12 },
  });
  assert.deepEqual(parsed.params, {
    type: "video",
    resolution: "1080p",
    ratio: "16:9",
    durationSeconds: 12,
    withAudio: true,
  });
});

test("video params fill only the omitted fields from defaults", () => {
  const parsed = parseSubmitJobRequest({
    type: "video",
    prompt: "orbit",
    params: { durationSeconds: 9 },
  });
  assert.deepEqual(parsed.params, {
    type: "video",
    resolution: "720p",
    ratio: "21:9",
    durationSeconds: 9,
    withAudio: true,
  });
});

test("rejects invalid video params", () => {
  const bad = [
    { resolution: "8K" },
    { ratio: "3:2" },
    { durationSeconds: 0 },
    { durationSeconds: -5 },
    { durationSeconds: 4.5 },
    { durationSeconds: "10" },
    { unknownField: 1 },
  ];
  for (const params of bad) {
    assert.throws(
      () => parseSubmitJobRequest({ type: "video", prompt: "x", params }),
      InvalidJobRequest,
      `${JSON.stringify(params)} must be rejected`,
    );
  }
});

test("accepts and validates image size", () => {
  assert.deepEqual(
    parseSubmitJobRequest({ type: "image", prompt: "x", params: { size: "2K" } }).params,
    { type: "image", size: "2K", count: 1 },
  );
  assert.throws(
    () => parseSubmitJobRequest({ type: "image", prompt: "x", params: { size: "8K" } }),
    InvalidJobRequest,
  );
});

test("accepts and validates voice style", () => {
  assert.deepEqual(
    parseSubmitJobRequest({ type: "voice", prompt: "x", params: { style: "expressive" } }).params,
    { type: "voice", style: "expressive" },
  );
  assert.throws(
    () => parseSubmitJobRequest({ type: "voice", prompt: "x", params: { style: "dramatic" } }),
    InvalidJobRequest,
  );
});

test("rejects params belonging to a different job type", () => {
  // resolution is a video field; it must not be silently ignored on an image job
  assert.throws(
    () => parseSubmitJobRequest({ type: "image", prompt: "x", params: { resolution: "720p" } }),
    InvalidJobRequest,
  );
});

// --- Input assets -----------------------------------------------------------

test("accepts well-formed input assets", () => {
  const parsed = parseSubmitJobRequest({
    type: "video",
    prompt: "animate this",
    inputAssets: [
      { assetId: "asset-1", role: "first_frame" },
      { assetId: "asset-2", role: "reference" },
    ],
  });
  assert.deepEqual(parsed.inputAssets, [
    { assetId: "asset-1", role: "first_frame" },
    { assetId: "asset-2", role: "reference" },
  ]);
});

test("rejects malformed input assets", () => {
  const bad: unknown[] = [
    "not-an-array",
    [{ assetId: "", role: "reference" }],
    [{ assetId: "a", role: "not_a_role" }],
    [{ assetId: 1, role: "reference" }],
    [{ assetId: "a" }],
    [{ assetId: "a", role: "reference", extra: true }],
  ];
  for (const inputAssets of bad) {
    assert.throws(
      () => parseSubmitJobRequest({ type: "video", prompt: "x", inputAssets }),
      InvalidJobRequest,
      `${JSON.stringify(inputAssets)} must be rejected`,
    );
  }
});

test("rejects duplicate single-slot roles but allows repeated references", () => {
  for (const role of ["first_frame", "last_frame"]) {
    assert.throws(
      () =>
        parseSubmitJobRequest({
          type: "video",
          prompt: "x",
          inputAssets: [
            { assetId: "a", role },
            { assetId: "b", role },
          ],
        }),
      InvalidJobRequest,
      `duplicate ${role} must be rejected`,
    );
  }

  const parsed = parseSubmitJobRequest({
    type: "video",
    prompt: "x",
    inputAssets: [
      { assetId: "a", role: "reference" },
      { assetId: "b", role: "reference" },
      { assetId: "c", role: "reference" },
    ],
  });
  assert.equal(parsed.inputAssets.length, 3);
});

test("allows up to three source videos, because extend stitches clips", () => {
  const parsed = parseSubmitJobRequest({
    type: "video",
    prompt: "the window in [Video 1] opens into [Video 2]",
    inputAssets: [
      { assetId: "a", role: "source_video" },
      { assetId: "b", role: "source_video" },
      { assetId: "c", role: "source_video" },
    ],
  });
  assert.equal(parsed.inputAssets.length, 3);

  assert.throws(
    () =>
      parseSubmitJobRequest({
        type: "video",
        prompt: "x",
        inputAssets: ["a", "b", "c", "d"].map((assetId) => ({
          assetId,
          role: "source_video",
        })),
      }),
    InvalidJobRequest,
  );
});

test("rejects more than the per-job input asset cap", () => {
  const tooMany = Array.from({ length: 9 }, (_, index) => ({
    assetId: `asset-${index}`,
    role: "reference" as const,
  }));
  assert.throws(
    () => parseSubmitJobRequest({ type: "video", prompt: "x", inputAssets: tooMany }),
    InvalidJobRequest,
  );
});

test("rejects video-only input asset roles on non-video jobs", () => {
  for (const role of ["first_frame", "last_frame", "source_video"]) {
    assert.throws(
      () =>
        parseSubmitJobRequest({
          type: "image",
          prompt: "x",
          inputAssets: [{ assetId: "a", role }],
        }),
      InvalidJobRequest,
      `${role} must be rejected on an image job`,
    );
  }
  // "reference" is valid on an image job (multi-reference image-to-image)
  assert.doesNotThrow(() =>
    parseSubmitJobRequest({
      type: "image",
      prompt: "x",
      inputAssets: [{ assetId: "a", role: "reference" }],
    }),
  );
});

// --- Model-aware validation -------------------------------------------------

test("accepts params within the configured model's documented limits", () => {
  assert.doesNotThrow(() =>
    assertParamsSupportedByModel(
      { type: "video", resolution: "1080p", ratio: "16:9", durationSeconds: 30, withAudio: false },
      "dreamina-seedance-2-5-260628",
    ),
  );
});

test("rejects a resolution the configured model does not support", () => {
  // seedance-2-0-fast documents 480p/720p only
  assert.throws(
    () =>
      assertParamsSupportedByModel(
        { type: "video", resolution: "1080p", ratio: "16:9", durationSeconds: 5, withAudio: false },
        "dreamina-seedance-2-0-fast-260128",
      ),
    InvalidJobRequest,
  );
});

test("rejects a duration outside the configured model's range", () => {
  // seedance-2-5 documents 4-30s
  assert.throws(
    () =>
      assertParamsSupportedByModel(
        { type: "video", resolution: "720p", ratio: "16:9", durationSeconds: 31, withAudio: false },
        "dreamina-seedance-2-5-260628",
      ),
    InvalidJobRequest,
  );
  assert.throws(
    () =>
      assertParamsSupportedByModel(
        { type: "video", resolution: "720p", ratio: "16:9", durationSeconds: 3, withAudio: false },
        "dreamina-seedance-2-5-260628",
      ),
    InvalidJobRequest,
  );
});

test("an unknown model validates against the conservative capability set", () => {
  // Must NOT wave everything through just because the model is unrecognized.
  assert.throws(
    () =>
      assertParamsSupportedByModel(
        { type: "video", resolution: "4K", ratio: "16:9", durationSeconds: 5, withAudio: false },
        "some-future-model-nobody-registered",
      ),
    InvalidJobRequest,
  );
  assert.doesNotThrow(() =>
    assertParamsSupportedByModel(
      { type: "video", resolution: "720p", ratio: "16:9", durationSeconds: 5, withAudio: false },
      "some-future-model-nobody-registered",
    ),
  );
});

test("image and voice params are not model-gated", () => {
  assert.doesNotThrow(() =>
    assertParamsSupportedByModel({ type: "image", size: "4K", count: 1 }, "anything"),
  );
  assert.doesNotThrow(() =>
    assertParamsSupportedByModel({ type: "voice", style: "expressive" }, "anything"),
  );
});

// --- Fixed profiles ---------------------------------------------------------

test("exposes immutable non-selectable output profiles", () => {
  assert.deepEqual(IMAGE_OUTPUT_PROFILE, {
    response_format: "url",
    output_format: "png",
    watermark: false,
  });
  assert.deepEqual(VOICE_PROFILE, {
    speaker: "en_female_stokie_uranus_bigtts",
    format: "mp3",
    sample_rate: 24000,
  });
  assert.deepEqual(AUDIO_GENERATION_PROFILE, {
    model: "seed-audio-1.0",
    format: "mp3",
    sample_rate: 48000,
  });
  for (const profile of [IMAGE_OUTPUT_PROFILE, VOICE_PROFILE, AUDIO_GENERATION_PROFILE]) {
    assert.equal(Object.isFrozen(profile), true);
  }
  assert.equal(Reflect.set(VOICE_PROFILE, "speaker", "other"), false);
});

test("exposes only Phase 1 job statuses", () => {
  assert.deepEqual(Object.values(JobStatus), ["queued", "processing", "complete", "failed"]);
});

// --- Adaptive ratio ---------------------------------------------------------

test("rejects ratio adaptive on a job with no input assets", () => {
  // "adaptive" means "match the input image"; there is nothing to match here.
  assert.throws(
    () =>
      parseSubmitJobRequest({
        type: "video",
        prompt: "a slow dolly in",
        params: { ratio: "adaptive" },
      }),
    InvalidJobRequest,
  );
});

test("accepts ratio adaptive when a keyframe is supplied", () => {
  const request = parseSubmitJobRequest({
    type: "video",
    prompt: "a slow dolly in",
    params: { ratio: "adaptive" },
    inputAssets: [{ assetId: "asset-1", role: "first_frame" }],
  });

  assert.deepEqual(request.params, {
    type: "video",
    resolution: "720p",
    ratio: "adaptive",
    durationSeconds: 5,
    withAudio: true,
  });
});

test("accepts both keyframes on one video job", () => {
  const request = parseSubmitJobRequest({
    type: "video",
    prompt: "morph between the two",
    inputAssets: [
      { assetId: "start", role: "first_frame" },
      { assetId: "end", role: "last_frame" },
    ],
  });

  assert.deepEqual(request.inputAssets, [
    { assetId: "start", role: "first_frame" },
    { assetId: "end", role: "last_frame" },
  ]);
});

// --- Batch image generation (C9) --------------------------------------------

test("image count defaults to one, so nothing changes for existing callers", () => {
  const parsed = parseSubmitJobRequest({ type: "image", prompt: "a fox" });
  assert.deepEqual(parsed.params, { type: "image", size: "4K", count: 1 });
});

test("image count must be a whole number within the batch ceiling", () => {
  for (const count of [0, 16, 2.5, -1, "4"]) {
    assert.throws(
      () =>
        parseSubmitJobRequest({
          type: "image",
          prompt: "a fox",
          params: { count },
        }),
      InvalidJobRequest,
      `count ${String(count)} must be rejected`,
    );
  }

  const parsed = parseSubmitJobRequest({
    type: "image",
    prompt: "a fox",
    params: { count: 15 },
  });
  assert.equal((parsed.params as { count: number }).count, 15);
});

test("references and generated images share the batch ceiling", () => {
  // R9: references + generated <= 15. Three references leave room for twelve.
  const parsed = parseSubmitJobRequest({
    type: "image",
    prompt: "a fox",
    params: { count: 12 },
    inputAssets: ["a", "b", "c"].map((assetId) => ({ assetId, role: "reference" })),
  });
  assert.equal(parsed.inputAssets.length, 3);

  assert.throws(
    () =>
      parseSubmitJobRequest({
        type: "image",
        prompt: "a fox",
        params: { count: 13 },
        inputAssets: ["a", "b", "c"].map((assetId) => ({ assetId, role: "reference" })),
      }),
    InvalidJobRequest,
  );
});

// --- 3D generation (C8) -----------------------------------------------------

test("a 3D job defaults to standard detail", () => {
  const parsed = parseSubmitJobRequest({ type: "model3d", prompt: "a wooden chair" });
  assert.deepEqual(parsed.params, { type: "model3d", quality: "standard" });
});

test("an unknown 3D quality is rejected rather than passed through", () => {
  // The provider has no published parameter documentation, so anything not on
  // the confirmed list would fail after the user was charged.
  assert.throws(
    () =>
      parseSubmitJobRequest({
        type: "model3d",
        prompt: "a chair",
        params: { quality: "ultra" },
      }),
    InvalidJobRequest,
  );
});

test("a 3D job rejects video-only input roles", () => {
  assert.throws(
    () =>
      parseSubmitJobRequest({
        type: "model3d",
        prompt: "a chair",
        inputAssets: [{ assetId: "a", role: "first_frame" }],
      }),
    InvalidJobRequest,
  );
});
