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

export async function getSignedAssetUrl(
  assetId: string,
  userId: string,
): Promise<string> {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });

  if (!asset || asset.userId !== userId) {
    throw new AssetNotFoundError();
  }

  const parsed = parseTosUrl(asset.storageUrl);

  const tosClient = new TosClient({
    accessKeyId: process.env.TOS_ACCESS_KEY || "",
    accessKeySecret: process.env.TOS_SECRET_KEY || "",
    region: process.env.TOS_REGION || "ap-southeast-1",
    endpoint: process.env.TOS_ENDPOINT || "",
  });

  return tosClient.getPreSignedUrl({
    method: "GET",
    bucket: parsed.bucket,
    key: parsed.key,
    expires: SIGNED_URL_EXPIRY_SECONDS,
  });
}
