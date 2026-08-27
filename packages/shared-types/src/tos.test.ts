import assert from "node:assert/strict";
import test from "node:test";

import { parseTosUrl } from "./tos.js";

test("parses a valid tos:// URL into bucket and key", () => {
  assert.deepEqual(parseTosUrl("tos://phase-one-assets/u1/j1/image-abc123.png"), {
    bucket: "phase-one-assets",
    key: "u1/j1/image-abc123.png",
  });
});

test("rejects a non-tos scheme", () => {
  assert.throws(() => parseTosUrl("https://phase-one-assets/u1/j1/image.png"));
});

test("rejects a URL with no key", () => {
  assert.throws(() => parseTosUrl("tos://phase-one-assets"));
});

test("rejects a bucket with invalid characters", () => {
  assert.throws(() => parseTosUrl("tos://Invalid_Bucket/u1/j1/image.png"));
});

test("rejects a key segment that is a directory traversal", () => {
  assert.throws(() => parseTosUrl("tos://phase-one-assets/u1/../j1/image.png"));
});

test("rejects a key with an empty segment", () => {
  assert.throws(() => parseTosUrl("tos://phase-one-assets/u1//image.png"));
});
