import assert from "node:assert/strict";
import test from "node:test";

import {
  AUDIO_GENERATION_PROFILE,
  IMAGE_PROFILE,
  InvalidJobRequest,
  JobStatus,
  VIDEO_PROFILE,
  VOICE_PROFILE,
  parseSubmitJobRequest,
} from "./jobs.js";

test("trims whitespace from image, video, and voice prompts", () => {
  assert.deepEqual(parseSubmitJobRequest({ type: "image", prompt: "  neon portrait  " }), {
    type: "image",
    prompt: "neon portrait",
  });
  assert.deepEqual(parseSubmitJobRequest({ type: "video", prompt: "\norbital sunrise\t" }), {
    type: "video",
    prompt: "orbital sunrise",
  });
  assert.deepEqual(parseSubmitJobRequest({ type: "voice", prompt: "  hello there  " }), {
    type: "voice",
    prompt: "hello there",
  });
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

test("rejects every request-controlled generation setting", () => {
  const fields = [
    "model",
    "size",
    "resolution",
    "ratio",
    "duration",
    "output_format",
    "outputFormat",
    "creditsCost",
  ];

  for (const field of fields) {
    assert.throws(
      () => parseSubmitJobRequest({ type: "video", prompt: "orbit", [field]: "unsafe" }),
      InvalidJobRequest,
      `${field} must not be accepted`,
    );
  }
});

test("rejects generation types outside the supported set", () => {
  for (const type of ["avatar", "director", "voice_clone", "transcription", "", 1, null]) {
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
  assert.deepEqual(parseSubmitJobRequest({ type: "image", prompt }), { type: "image", prompt });
});

test("accepts a standard or expressive voiceStyle on voice jobs", () => {
  assert.deepEqual(parseSubmitJobRequest({ type: "voice", prompt: "hi", voiceStyle: "standard" }), {
    type: "voice",
    prompt: "hi",
    voiceStyle: "standard",
  });
  assert.deepEqual(parseSubmitJobRequest({ type: "voice", prompt: "hi", voiceStyle: "expressive" }), {
    type: "voice",
    prompt: "hi",
    voiceStyle: "expressive",
  });
});

test("rejects voiceStyle on non-voice jobs and rejects invalid voiceStyle values", () => {
  assert.throws(
    () => parseSubmitJobRequest({ type: "image", prompt: "hi", voiceStyle: "expressive" }),
    InvalidJobRequest,
  );
  assert.throws(
    () => parseSubmitJobRequest({ type: "voice", prompt: "hi", voiceStyle: "dramatic" }),
    InvalidJobRequest,
  );
});

test("exposes immutable fixed generation profiles", () => {
  assert.deepEqual(IMAGE_PROFILE, {
    size: "4K",
    response_format: "url",
    output_format: "png",
    watermark: false,
    sequential_image_generation: "disabled",
  });
  assert.deepEqual(VIDEO_PROFILE, { resolution: "720p", ratio: "21:9", duration: 5 });
  assert.deepEqual(VOICE_PROFILE, {
    speaker: "en_female_stokie_uranus_bigtts",
    format: "mp3",
    sample_rate: 24000,
  });
  assert.equal(Object.isFrozen(IMAGE_PROFILE), true);
  assert.equal(Object.isFrozen(VIDEO_PROFILE), true);
  assert.equal(Object.isFrozen(VOICE_PROFILE), true);
  assert.equal(Reflect.set(IMAGE_PROFILE, "size", "1K"), false);
  assert.equal(Reflect.set(VIDEO_PROFILE, "duration", 30), false);
  assert.equal(Reflect.set(VOICE_PROFILE, "speaker", "other"), false);
  assert.deepEqual(AUDIO_GENERATION_PROFILE, {
    model: "seed-audio-1.0",
    format: "mp3",
    sample_rate: 48000,
  });
  assert.equal(Object.isFrozen(AUDIO_GENERATION_PROFILE), true);
});

test("exposes only Phase 1 job statuses", () => {
  assert.deepEqual(Object.values(JobStatus), ["queued", "processing", "complete", "failed"]);
});
