import { prisma } from "@creative-ai/db";
import { parseTosUrl } from "@creative-ai/shared-types";
import { TosClient } from "@volcengine/tos-sdk";

const SIGNED_URL_EXPIRY_SECONDS = 300;

export class AssetNotFoundError extends Error {
  constructor() {
    super("Asset not found");
    this.name = "AssetNotFoundError";
  }
}

export interface AssetLookup {
  findAsset(assetId: string): Promise<{ userId: string; storageUrl: string } | null>;
  signUrl(input: { bucket: string; key: string; expires: number }): string;
}

function defaultLookup(): AssetLookup {
  return {
    findAsset: async (assetId) =>
      prisma.asset.findUnique({ where: { id: assetId } }),
    signUrl: (input) => {
      const tosClient = new TosClient({
        accessKeyId: process.env.TOS_ACCESS_KEY || "",
        accessKeySecret: process.env.TOS_SECRET_KEY || "",
        region: process.env.TOS_REGION || "ap-southeast-1",
        endpoint: process.env.TOS_ENDPOINT || "",
      });
      return tosClient.getPreSignedUrl({ method: "GET", ...input });
    },
  };
}

/**
 * Signs a short-lived download URL for an asset the user owns.
 *
 * A missing asset and an asset owned by someone else raise the *same* error on
 * purpose: the caller turns it into a 404, so a user cannot probe which asset
 * ids exist. Dependencies are injectable so that guard is testable without TOS
 * credentials or a database.
 */
export async function getSignedAssetUrl(
  assetId: string,
  userId: string,
  lookup: AssetLookup = defaultLookup(),
): Promise<string> {
  const asset = await lookup.findAsset(assetId);

  if (!asset || asset.userId !== userId) {
    throw new AssetNotFoundError();
  }

  const parsed = parseTosUrl(asset.storageUrl);

  return lookup.signUrl({
    bucket: parsed.bucket,
    key: parsed.key,
    expires: SIGNED_URL_EXPIRY_SECONDS,
  });
}
