import assert from "node:assert/strict";
import test from "node:test";

import {
  IMAGE_PROFILE,
  InvalidJobRequest,
  JobStatus,
  VIDEO_PROFILE,
  parseSubmitJobRequest,
} from "./jobs.js";

test("trims whitespace from image and video prompts", () => {
  assert.deepEqual(parseSubmitJobRequest({ type: "image", prompt: "  neon portrait  " }), {
    type: "image",
    prompt: "neon portrait",
  });
  assert.deepEqual(parseSubmitJobRequest({ type: "video", prompt: "\norbital sunrise\t" }), {
    type: "video",
    prompt: "orbital sunrise",
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

test("rejects generation types outside Phase 1", () => {
  for (const type of ["voice", "avatar", "director", "", 1, null]) {
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

test("exposes immutable fixed generation profiles", () => {
  assert.deepEqual(IMAGE_PROFILE, {
    size: "4K",
    response_format: "url",
    output_format: "png",
    watermark: false,
    sequential_image_generation: "disabled",
  });
  assert.deepEqual(VIDEO_PROFILE, { resolution: "720p", ratio: "21:9", duration: 5 });
  assert.equal(Object.isFrozen(IMAGE_PROFILE), true);
  assert.equal(Object.isFrozen(VIDEO_PROFILE), true);
  assert.equal(Reflect.set(IMAGE_PROFILE, "size", "1K"), false);
  assert.equal(Reflect.set(VIDEO_PROFILE, "duration", 30), false);
});

test("exposes only Phase 1 job statuses", () => {
  assert.deepEqual(Object.values(JobStatus), ["queued", "processing", "complete", "failed"]);
});
