import assert from "node:assert/strict";
import test from "node:test";

import type {
  CreateEmbeddingRequest,
  CreateEmbeddingResponse,
} from "@creative-ai/modelark-client";

import {
  EmbeddingDimensionMismatch,
  cosineSimilarity,
  embedAssetUrl,
  findSimilarAssets,
  rankBySimilarity,
  searchAssets,
  type SemanticSearchDependencies,
  type StoredEmbedding,
} from "./semantic-search.js";

const DIMENSIONS = 4;

function vectorResponse(vector: number[]): CreateEmbeddingResponse {
  return {
    created: 1_777_000_000,
    model: "skylark-embedding-vision-250615",
    data: { embedding: vector, object: "embedding" },
  };
}

function fakeDependencies({
  queryVector = [1, 0, 0, 0],
  stored = [],
}: {
  queryVector?: number[];
  stored?: StoredEmbedding[];
} = {}) {
  const requests: CreateEmbeddingRequest[] = [];
  const dependencies: SemanticSearchDependencies = {
    embed: async (params) => {
      requests.push(params);
      return vectorResponse(queryVector);
    },
    loadEmbeddings: async () => stored,
    model: "skylark-embedding-vision-250615",
    dimensions: DIMENSIONS,
  };
  return { dependencies, requests };
}

test("cosine similarity is 1 for identical direction and 0 for orthogonal", () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [2, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
});

test("a zero vector scores 0 rather than NaN", () => {
  // NaN would sort unpredictably instead of simply ranking last.
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
});

test("comparing different lengths throws rather than guessing", () => {
  assert.throws(() => cosineSimilarity([1, 2], [1, 2, 3]));
});

test("ranking returns best first and honours the limit", () => {
  const ranked = rankBySimilarity(
    [1, 0, 0, 0],
    [
      { assetId: "orthogonal", vector: [0, 1, 0, 0] },
      { assetId: "exact", vector: [1, 0, 0, 0] },
      { assetId: "close", vector: [0.9, 0.1, 0, 0] },
    ],
    2,
  );

  assert.deepEqual(
    ranked.map((hit) => hit.assetId),
    ["exact", "close"],
  );
});

test("vectors of a different dimension are skipped, not compared", () => {
  // They come from a different model or dimension setting. Comparing them
  // would not throw — it would silently return a meaningless ranking.
  const ranked = rankBySimilarity(
    [1, 0, 0, 0],
    [
      { assetId: "wrong-dimensions", vector: [1, 0] },
      { assetId: "right", vector: [1, 0, 0, 0] },
    ],
    10,
  );

  assert.deepEqual(
    ranked.map((hit) => hit.assetId),
    ["right"],
  );
});

test("search embeds the query as text and ranks against stored vectors", async () => {
  const { dependencies, requests } = fakeDependencies({
    queryVector: [1, 0, 0, 0],
    stored: [
      { assetId: "far", vector: [0, 1, 0, 0] },
      { assetId: "near", vector: [1, 0, 0, 0] },
    ],
  });

  const hits = await searchAssets(dependencies, "user-1", "a red car", 10);

  assert.deepEqual(requests[0]?.input, [{ type: "text", text: "a red car" }]);
  assert.equal(hits[0]?.assetId, "near");
});

test("an empty query spends nothing", async () => {
  const { dependencies, requests } = fakeDependencies({
    stored: [{ assetId: "a", vector: [1, 0, 0, 0] }],
  });

  assert.deepEqual(await searchAssets(dependencies, "user-1", "   ", 10), []);
  assert.equal(requests.length, 0);
});

test("searching an unindexed library spends nothing", async () => {
  // Embedding the query would burn tokens to rank an empty list.
  const { dependencies, requests } = fakeDependencies({ stored: [] });

  assert.deepEqual(await searchAssets(dependencies, "user-1", "a red car", 10), []);
  assert.equal(requests.length, 0);
});

test("more-like-this excludes the seed asset from its own results", async () => {
  const { dependencies, requests } = fakeDependencies({
    stored: [
      { assetId: "seed", vector: [1, 0, 0, 0] },
      { assetId: "other", vector: [0.9, 0.1, 0, 0] },
    ],
  });

  const hits = await findSimilarAssets(dependencies, "user-1", "seed", 10);

  // The seed would always rank first at similarity 1, which tells the user
  // nothing. It also needs no provider call — the vector is already stored.
  assert.deepEqual(
    hits.map((hit) => hit.assetId),
    ["other"],
  );
  assert.equal(requests.length, 0);
});

test("more-like-this on an unindexed asset returns nothing", async () => {
  const { dependencies } = fakeDependencies({
    stored: [{ assetId: "other", vector: [1, 0, 0, 0] }],
  });

  assert.deepEqual(await findSimilarAssets(dependencies, "user-1", "seed", 10), []);
});

test("an image is embedded as image_url and a video as video_url", async () => {
  const { dependencies, requests } = fakeDependencies({ queryVector: [1, 0, 0, 0] });

  await embedAssetUrl(dependencies, "a1", "image", "https://signed.example/a1");
  await embedAssetUrl(dependencies, "v1", "video", "https://signed.example/v1");

  assert.deepEqual(requests[0]?.input, [
    { type: "image_url", image_url: { url: "https://signed.example/a1" } },
  ]);
  assert.deepEqual(requests[1]?.input, [
    { type: "video_url", video_url: { url: "https://signed.example/v1" } },
  ]);
});

test("a vector of unexpected length is rejected rather than stored", async () => {
  // Storing it would poison every later comparison silently.
  const { dependencies } = fakeDependencies({ queryVector: [1, 0] });

  await assert.rejects(
    embedAssetUrl(dependencies, "a1", "image", "https://signed.example/a1"),
    EmbeddingDimensionMismatch,
  );
});

test("a provider error surfaces rather than being stored as an empty vector", async () => {
  const dependencies: SemanticSearchDependencies = {
    embed: async () => ({
      created: 1,
      model: "skylark-embedding-vision-250615",
      data: { embedding: [], object: "embedding" },
      error: { code: "QuotaExceeded", message: "out of quota" },
    }),
    loadEmbeddings: async () => [],
    model: "skylark-embedding-vision-250615",
    dimensions: DIMENSIONS,
  };

  await assert.rejects(
    embedAssetUrl(dependencies, "a1", "image", "https://signed.example/a1"),
    /out of quota/,
  );
});
