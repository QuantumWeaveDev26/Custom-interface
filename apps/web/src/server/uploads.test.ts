import assert from "node:assert/strict";
import test from "node:test";

import type { AssetRecord, DatabaseStore } from "@creative-ai/db";

import {
  InvalidUploadError,
  MAX_UPLOAD_BYTES,
  detectImageFormat,
  storeUploadedImage,
  type UploadDependencies,
} from "./uploads.js";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2,
]);

function harness() {
  const puts: Array<{ key: string; contentType: string }> = [];
  const created: Array<{ userId: string; storageUrl: string }> = [];
  let idCounter = 0;

  const dependencies: UploadDependencies = {
    bucket: "test-bucket",
    newId: () => `uuid-${++idCounter}`,
    putObject: async ({ key, contentType }) => {
      puts.push({ key, contentType });
    },
    store: {
      asset: {
        createUploaded: async ({
          data,
        }: {
          data: { userId: string; type: "image"; storageUrl: string };
        }) => {
          created.push({ userId: data.userId, storageUrl: data.storageUrl });
          return {
            id: `asset-${created.length}`,
            jobId: null,
            userId: data.userId,
            type: data.type,
            storageUrl: data.storageUrl,
            thumbnailUrl: null,
            createdAt: new Date("2026-08-29T00:00:00.000Z"),
          } satisfies AssetRecord;
        },
      },
    } as unknown as DatabaseStore,
  };

  return { dependencies, puts, created };
}

// --- Format detection -------------------------------------------------------

test("detects the supported image formats by magic bytes", () => {
  assert.equal(detectImageFormat(PNG)?.extension, "png");
  assert.equal(detectImageFormat(JPEG)?.extension, "jpg");
  assert.equal(detectImageFormat(WEBP)?.extension, "webp");
});

test("rejects content that is not actually an image", () => {
  // A file named .png containing a script is the case this exists to stop.
  const script = new TextEncoder().encode("<?php system($_GET['c']); ?>");
  assert.equal(detectImageFormat(script), null);

  const pdf = Uint8Array.from([0x25, 0x50, 0x44, 0x46]); // "%PDF"
  assert.equal(detectImageFormat(pdf), null);

  // RIFF container that is not WebP (e.g. a WAV) must not pass as an image.
  const wav = Uint8Array.from([
    0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
  ]);
  assert.equal(detectImageFormat(wav), null);
});

test("a truncated file cannot be mistaken for a valid format", () => {
  assert.equal(detectImageFormat(Uint8Array.from([0x89, 0x50])), null);
  assert.equal(detectImageFormat(new Uint8Array()), null);
});

// --- Storing ----------------------------------------------------------------

test("stores an image and records it as an asset with no job", async () => {
  const { dependencies, puts, created } = harness();

  const asset = await storeUploadedImage("user-1", PNG, dependencies);

  assert.equal(puts.length, 1);
  assert.equal(puts[0]?.contentType, "image/png");
  assert.equal(asset.jobId, null, "an upload has no generating job");
  assert.equal(asset.userId, "user-1");
  assert.equal(created[0]?.storageUrl, "tos://test-bucket/user-1/uploads/uuid-1.png");
});

test("the storage key is derived from the user id, never the filename", async () => {
  const { dependencies, puts } = harness();

  await storeUploadedImage("user-1", JPEG, dependencies);

  // Prefix is the owner's id and a fresh UUID, so a crafted filename cannot
  // escape the user's prefix or overwrite an existing object.
  assert.match(puts[0]?.key ?? "", /^user-1\/uploads\/uuid-\d+\.jpg$/);
});

test("the extension follows the detected format, not the declared one", async () => {
  const { dependencies, puts } = harness();

  await storeUploadedImage("user-1", WEBP, dependencies);

  assert.match(puts[0]?.key ?? "", /\.webp$/);
  assert.equal(puts[0]?.contentType, "image/webp");
});

test("rejects a non-image before writing anything", async () => {
  const { dependencies, puts, created } = harness();
  const script = new TextEncoder().encode("not an image at all");

  await assert.rejects(
    storeUploadedImage("user-1", script, dependencies),
    InvalidUploadError,
  );
  assert.deepEqual(puts, []);
  assert.deepEqual(created, []);
});

test("rejects an empty file", async () => {
  const { dependencies } = harness();

  await assert.rejects(
    storeUploadedImage("user-1", new Uint8Array(), dependencies),
    InvalidUploadError,
  );
});

test("rejects a file over the size cap before writing anything", async () => {
  const { dependencies, puts } = harness();
  const huge = new Uint8Array(MAX_UPLOAD_BYTES + 1);
  huge.set(PNG.subarray(0, 8));

  await assert.rejects(
    storeUploadedImage("user-1", huge, dependencies),
    InvalidUploadError,
  );
  assert.deepEqual(puts, []);
});

test("the asset row is only created after the object is stored", async () => {
  const { dependencies, created } = harness();
  dependencies.putObject = async () => {
    throw new Error("TOS is down");
  };

  await assert.rejects(storeUploadedImage("user-1", PNG, dependencies), /TOS is down/);
  // Otherwise the gallery would show an asset whose bytes do not exist.
  assert.deepEqual(created, []);
});
