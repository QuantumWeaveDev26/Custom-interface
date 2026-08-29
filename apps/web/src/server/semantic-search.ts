import type {
  CreateEmbeddingRequest,
  CreateEmbeddingResponse,
} from "@creative-ai/modelark-client";

/**
 * Semantic search over a user's own assets.
 *
 * Similarity is computed here rather than in the database because pgvector is
 * not installed on the target Postgres. For a per-user library this is cheap —
 * a few thousand 2048-float vectors is single-digit milliseconds — and it keeps
 * the feature from waiting on a database extension. It stops being appropriate
 * somewhere around tens of thousands of assets per user, or as soon as search
 * needs to span users; see PROJECT_STATE.md.
 */

/** Only assets with a body to look at can be embedded. */
export const EMBEDDABLE_ASSET_TYPES = ["image", "video"] as const;

/**
 * How many assets one indexing call may embed.
 *
 * Embedding an image costs real money — the provider's own sample burned 13,800
 * tokens on one image — so indexing is capped and user-triggered rather than an
 * unbounded background loop over the whole library.
 */
export const MAX_ASSETS_PER_INDEX_CALL = 20;

export interface StoredEmbedding {
  assetId: string;
  vector: number[];
}

export interface SearchHit {
  assetId: string;
  score: number;
}

export class EmbeddingDimensionMismatch extends Error {
  constructor(assetId: string, expected: number, actual: number) {
    super(
      `Embedding for asset ${assetId} has ${actual} dimensions, expected ${expected}`,
    );
    this.name = "EmbeddingDimensionMismatch";
  }
}

/**
 * Cosine similarity, in [-1, 1].
 *
 * A zero-magnitude vector has no direction, so its similarity to anything is
 * undefined; 0 is returned rather than dividing by zero and producing NaN,
 * which would sort unpredictably rather than simply ranking last.
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Cannot compare vectors of length ${a.length} and ${b.length}`);
  }

  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index] as number;
    const right = b[index] as number;
    dot += left * right;
    magnitudeA += left * left;
    magnitudeB += right * right;
  }

  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dot / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

/**
 * Ranks stored embeddings against a query vector, best first.
 *
 * Vectors of a different length are skipped rather than compared: they come
 * from a different model or dimension setting, and comparing them would not
 * throw, it would silently return a meaningless ranking.
 */
export function rankBySimilarity(
  queryVector: readonly number[],
  stored: readonly StoredEmbedding[],
  limit: number,
): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const candidate of stored) {
    if (candidate.vector.length !== queryVector.length) continue;
    hits.push({
      assetId: candidate.assetId,
      score: cosineSimilarity(queryVector, candidate.vector),
    });
  }

  hits.sort((left, right) => right.score - left.score);
  return hits.slice(0, limit);
}

export interface SemanticSearchDependencies {
  embed(params: CreateEmbeddingRequest): Promise<CreateEmbeddingResponse>;
  /** Every stored vector belonging to this user. */
  loadEmbeddings(userId: string): Promise<StoredEmbedding[]>;
  model: string;
  dimensions: number;
}

function readVector(
  response: CreateEmbeddingResponse,
  label: string,
  dimensions: number,
): number[] {
  if (response.error !== undefined) {
    throw new Error(`Embedding failed: ${response.error.message}`);
  }
  const vector = response.data?.embedding;
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error("Embedding response has no vector");
  }
  if (vector.length !== dimensions) {
    throw new EmbeddingDimensionMismatch(label, dimensions, vector.length);
  }
  return vector;
}

/** Embeds one asset's media URL. Signing happens at the call site. */
export async function embedAssetUrl(
  dependencies: SemanticSearchDependencies,
  assetId: string,
  type: "image" | "video",
  signedUrl: string,
): Promise<number[]> {
  const response = await dependencies.embed({
    model: dependencies.model,
    dimensions: dependencies.dimensions,
    encoding_format: "float",
    input: [
      type === "image"
        ? { type: "image_url", image_url: { url: signedUrl } }
        : { type: "video_url", video_url: { url: signedUrl } },
    ],
  });
  return readVector(response, assetId, dependencies.dimensions);
}

export async function searchAssets(
  dependencies: SemanticSearchDependencies,
  userId: string,
  query: string,
  limit: number,
): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const stored = await dependencies.loadEmbeddings(userId);
  // Nothing indexed yet — asking the provider to embed the query would spend
  // tokens to rank an empty list.
  if (stored.length === 0) return [];

  const response = await dependencies.embed({
    model: dependencies.model,
    dimensions: dependencies.dimensions,
    encoding_format: "float",
    input: [{ type: "text", text: trimmed }],
  });
  const queryVector = readVector(response, "query", dependencies.dimensions);

  return rankBySimilarity(queryVector, stored, limit);
}

/**
 * "More like this": ranks the user's other assets against one they picked.
 *
 * The seed asset is excluded from its own results — it would always rank first
 * at a similarity of 1, which tells the user nothing.
 */
export async function findSimilarAssets(
  dependencies: SemanticSearchDependencies,
  userId: string,
  assetId: string,
  limit: number,
): Promise<SearchHit[]> {
  const stored = await dependencies.loadEmbeddings(userId);
  const seed = stored.find((candidate) => candidate.assetId === assetId);
  if (seed === undefined) return [];

  const others = stored.filter((candidate) => candidate.assetId !== assetId);
  return rankBySimilarity(seed.vector, others, limit);
}
