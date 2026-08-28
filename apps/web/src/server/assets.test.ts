import assert from "node:assert/strict";
import test from "node:test";

import {
  AssetNotFoundError,
  getSignedAssetUrl,
  type AssetLookup,
} from "./assets.js";

function lookup(
  asset: { userId: string; storageUrl: string } | null,
): { lookup: AssetLookup; signed: Array<{ bucket: string; key: string }> } {
  const signed: Array<{ bucket: string; key: string }> = [];
  return {
    lookup: {
      findAsset: async () => asset,
      signUrl: ({ bucket, key, expires }) => {
        signed.push({ bucket, key });
        return `https://tos.example/${bucket}/${key}?expires=${expires}`;
      },
    },
    signed,
  };
}

test("signs a short-lived URL for an asset the user owns", async () => {
  const { lookup: assetLookup, signed } = lookup({
    userId: "user-1",
    storageUrl: "tos://my-bucket/user-1/job-1/image-abc.png",
  });

  const url = await getSignedAssetUrl("asset-1", "user-1", assetLookup);

  assert.deepEqual(signed, [
    { bucket: "my-bucket", key: "user-1/job-1/image-abc.png" },
  ]);
  assert.match(url, /^https:\/\/tos\.example\//);
});

test("signed URLs expire in 5 minutes, not indefinitely", async () => {
  const { lookup: assetLookup } = lookup({
    userId: "user-1",
    storageUrl: "tos://my-bucket/user-1/job-1/image-abc.png",
  });

  const url = await getSignedAssetUrl("asset-1", "user-1", assetLookup);

  assert.match(url, /expires=300$/);
});

test("another user's asset is refused and never signed", async () => {
  const { lookup: assetLookup, signed } = lookup({
    userId: "user-2",
    storageUrl: "tos://my-bucket/user-2/job-9/image-xyz.png",
  });

  await assert.rejects(
    getSignedAssetUrl("asset-1", "user-1", assetLookup),
    AssetNotFoundError,
  );
  // The guard must run before signing, or the URL leaks even on the error path.
  assert.deepEqual(signed, []);
});

test("a missing asset raises the same error as an unowned one", async () => {
  const { lookup: assetLookup } = lookup(null);

  // Identical failure on purpose: the route turns both into 404 so a user
  // cannot probe which asset ids exist.
  await assert.rejects(
    getSignedAssetUrl("does-not-exist", "user-1", assetLookup),
    AssetNotFoundError,
  );
});
