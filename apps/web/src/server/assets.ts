import { prismaStore } from "@creative-ai/db";
import { TosClient } from "@volcengine/tos-sdk";
import { parseTosUrl } from "@creative-ai/worker/storage";

export async function getSignedAssetUrl(assetId: string, userId: string): Promise<string> {
  // Load asset from database
  const asset = await prismaStore.asset.findUnique({ where: { id: assetId } });

  if (!asset) {
    throw new Error("Asset not found");
  }

  if (asset.userId !== userId) {
    throw new Error("Unauthorized");
  }

  // Parse the TOS URL
  const parsed = parseTosUrl(asset.storageUrl);

  // Create TOS client
  const tosClient = new TosClient({
    accessKeyId: process.env.TOS_ACCESS_KEY || "",
    accessKeySecret: process.env.TOS_SECRET_KEY || "",
    region: process.env.TOS_REGION || "ap-southeast-1",
    endpoint: process.env.TOS_ENDPOINT || "",
  });

  // Generate signed URL valid for 15 minutes
  const signedUrl = await tosClient.getPreSignedUrl({
    bucket: parsed.bucket,
    key: parsed.key,
    expires: 15 * 60,
  });

  return signedUrl;
}
