import { prisma } from "@creative-ai/db";
import { EMBEDDING_DIMENSIONS } from "@creative-ai/shared-types";
import { createModelArkClient } from "@creative-ai/modelark-client";

import { getSignedAssetUrl } from "./assets";
import {
  EMBEDDABLE_ASSET_TYPES,
  MAX_ASSETS_PER_INDEX_CALL,
  embedAssetUrl,
  type SemanticSearchDependencies,
} from "./semantic-search";

// -250615 and later accept mixed input and a dimensions parameter; the older
// -250328 accepts only three fixed input combinations (R6). Do not fall back to
// it.
export const EMBEDDING_MODEL =
  process.env.MODELARK_EMBEDDING_MODEL || "skylark-embedding-vision-250615";

// Shared with the worker so both sides write comparable vectors — see the note
// on EMBEDDING_DIMENSIONS in shared-types.
export { EMBEDDING_DIMENSIONS };

export function semanticSearchDependencies(): SemanticSearchDependencies {
  const client = createModelArkClient({
    apiKey: process.env.ARK_API_KEY || "",
    ...(process.env.MODELARK_BASE_URL
      ? { baseUrl: process.env.MODELARK_BASE_URL }
      : {}),
  });

  return {
    embed: (params) => client.createEmbedding(params),
    loadEmbeddings: async (userId) => {
      const rows = await prisma.assetEmbedding.findMany({
        where: { userId, model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS },
        select: { assetId: true, vector: true },
      });
      return rows.map((row) => ({ assetId: row.assetId, vector: row.vector }));
    },
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
  };
}

export interface IndexResult {
  indexed: number;
  remaining: number;
  failed: number;
}

/**
 * Embeds a capped batch of the user's not-yet-indexed assets.
 *
 * Capped and user-triggered because embedding an image costs real tokens; an
 * unbounded background sweep over a large library would spend without the user
 * ever asking for it. The caller reports `remaining` so the user can decide
 * whether to run it again.
 *
 * One asset failing does not abort the batch — a single unreadable file should
 * not block indexing everything else — but failures are counted and surfaced
 * rather than being swallowed.
 */
export async function indexUserAssets(userId: string): Promise<IndexResult> {
  const dependencies = semanticSearchDependencies();

  const pending = await prisma.asset.findMany({
    where: {
      userId,
      type: { in: [...EMBEDDABLE_ASSET_TYPES] },
      embedding: { is: null },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, type: true },
  });

  const batch = pending.slice(0, MAX_ASSETS_PER_INDEX_CALL);
  let indexed = 0;
  let failed = 0;

  for (const asset of batch) {
    try {
      // The provider fetches the media itself and cannot read our private
      // bucket, so it gets a short-lived signed URL — the same path the worker
      // uses for generation inputs.
      const signedUrl = await getSignedAssetUrl(asset.id, userId);
      const vector = await embedAssetUrl(
        dependencies,
        asset.id,
        asset.type === "video" ? "video" : "image",
        signedUrl,
      );

      await prisma.assetEmbedding.create({
        data: {
          assetId: asset.id,
          userId,
          model: EMBEDDING_MODEL,
          dimensions: EMBEDDING_DIMENSIONS,
          vector,
        },
      });
      indexed += 1;
    } catch (error) {
      failed += 1;
      console.error(`Failed to embed asset ${asset.id}:`, error);
    }
  }

  return { indexed, failed, remaining: pending.length - batch.length };
}
