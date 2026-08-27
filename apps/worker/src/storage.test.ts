import assert from "node:assert/strict";
import test from "node:test";

import { createTosStorage, parseTosUrl } from "./storage.js";

test("TOS storage uploads to a scoped random key and returns a private URL", async () => {
  const uploads: unknown[] = [];
  const storage = createTosStorage({
    bucket: "phase-one-assets",
    client: {
      putObject: async (input) => {
        uploads.push(input);
        return {};
      },
    },
    randomId: () => "abc123",
  });

  const url = await storage.upload({
    userId: "u1",
    jobId: "j1",
    type: "image",
    body: new Uint8Array([1, 2, 3]),
    contentType: "image/png",
  });

  assert.equal(url, "tos://phase-one-assets/u1/j1/image-abc123.png");
  assert.deepEqual(uploads, [
    {
      bucket: "phase-one-assets",
      key: "u1/j1/image-abc123.png",
      body: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
    },
  ]);
});

test("TOS storage uses the media content type to choose a safe extension", async () => {
  const keys: string[] = [];
  const storage = createTosStorage({
    bucket: "phase-one-assets",
    client: {
      putObject: async (input) => {
        keys.push(input.key);
        return {};
      },
    },
    randomId: () => "video-id",
  });

  await storage.upload({
    userId: "u1",
    jobId: "j2",
    type: "video",
    body: new Uint8Array([4, 5]),
    contentType: "video/mp4",
  });

  assert.deepEqual(keys, ["u1/j2/video-video-id.mp4"]);
});

test("parseTosUrl extracts a strict bucket and key", () => {
  assert.deepEqual(parseTosUrl("tos://phase-one-assets/u1/j1/image-a.png"), {
    bucket: "phase-one-assets",
    key: "u1/j1/image-a.png",
  });
});

test("parseTosUrl rejects malformed or unsafe private URLs", () => {
  const malformed = [
    "https://phase-one-assets/u1/image.png",
    "tos://",
    "tos:///u1/image.png",
    "tos://phase-one-assets",
    "tos://phase-one-assets/",
    "tos://Phase One/u1/image.png",
    "tos://phase-one-assets/u1/../image.png",
    "tos://phase-one-assets/u1/image.png?download=1",
    "tos://phase-one-assets/u1\\image.png",
  ];

  for (const url of malformed) {
    assert.throws(() => parseTosUrl(url), /Invalid TOS URL/);
  }
});

