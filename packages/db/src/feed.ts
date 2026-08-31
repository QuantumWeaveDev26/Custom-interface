import { prisma } from "./client.js";

export interface FeedItem {
  assetId: string;
  type: string;
  prompt: string | null;
  publishedAt: Date;
}

/**
 * Publishes or unpublishes one asset, only for its owner.
 *
 * The ownership check is part of the update rather than a separate read: a
 * `where` that names both the id and the user cannot be raced into publishing
 * somebody else's asset. Returns false when nothing matched, which the route
 * turns into a 404 — telling a caller "not yours" would confirm the asset
 * exists.
 */
export async function setAssetPublished(
  assetId: string,
  userId: string,
  published: boolean,
): Promise<boolean> {
  const result = await prisma.asset.updateMany({
    where: { id: assetId, userId },
    data: { publishedAt: published ? new Date() : null },
  });
  return result.count === 1;
}

function promptOf(inputParams: unknown): string | null {
  if (typeof inputParams !== "object" || inputParams === null) return null;
  const prompt = (inputParams as { prompt?: unknown }).prompt;
  return typeof prompt === "string" ? prompt : null;
}

/**
 * The public feed, newest share first.
 *
 * Only the media and the prompt travel: no user id, no name, no job settings.
 * Publishing an asset is not a decision to publish who made it.
 */
export async function loadFeed(limit: number): Promise<FeedItem[]> {
  const rows = await prisma.asset.findMany({
    where: { publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      publishedAt: true,
      job: { select: { inputParams: true } },
    },
  });

  return rows.map((row) => ({
    assetId: row.id,
    type: row.type,
    // The prompt lives inside the job's stored inputParams rather than in a
    // column of its own, and an uploaded asset has no job at all.
    prompt: promptOf(row.job?.inputParams),
    // Non-null by the where clause; Prisma cannot narrow that.
    publishedAt: row.publishedAt as Date,
  }));
}
