import { prisma } from "./client.js";

/**
 * Whether this user asked for generated assets to be indexed as they complete.
 *
 * Read per job rather than cached: the toggle is expected to be flipped while
 * the worker is running, and a stale cached "false" would quietly drop the
 * indexing the user just turned on.
 */
export async function autoIndexEnabled(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { autoIndexAssets: true },
  });
  return user?.autoIndexAssets ?? false;
}

export async function setAutoIndex(
  userId: string,
  enabled: boolean,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { autoIndexAssets: enabled },
  });
}

/**
 * Stores one vector, ignoring a second write for the same asset.
 *
 * The asset is the primary key, so an asset indexed on completion and then
 * caught again by the manual sweep would otherwise throw. Two writes racing is
 * not an error worth surfacing — both would store the same vector.
 */
export async function storeAssetEmbedding(input: {
  assetId: string;
  userId: string;
  model: string;
  dimensions: number;
  vector: number[];
}): Promise<void> {
  await prisma.assetEmbedding.upsert({
    where: { assetId: input.assetId },
    create: input,
    update: {},
  });
}
