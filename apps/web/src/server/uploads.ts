import { randomUUID } from "node:crypto";

import { prismaStore, type AssetRecord, type DatabaseStore } from "@creative-ai/db";
import { TosClient } from "@volcengine/tos-sdk";

// 15 MB. Generous for a photo, small enough that a single request cannot tie up
// the server or fill the bucket.
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export class InvalidUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidUploadError";
  }
}

interface ImageFormat {
  extension: "png" | "jpg" | "webp";
  contentType: string;
}

/**
 * Identifies an image by its magic bytes rather than trusting the browser's
 * declared Content-Type or the filename extension.
 *
 * Both of those are attacker-controlled. Storing an arbitrary file under an
 * image extension and later handing it to BytePlus — or serving it back to a
 * browser — is exactly how a content-type confusion bug starts.
 */
export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  const startsWith = (...signature: number[]): boolean =>
    signature.every((byte, index) => bytes[index] === byte);

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return { extension: "png", contentType: "image/png" };
  }
  // JPEG: FF D8 FF
  if (startsWith(0xff, 0xd8, 0xff)) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    startsWith(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { extension: "webp", contentType: "image/webp" };
  }
  return null;
}

export interface UploadDependencies {
  store: DatabaseStore;
  bucket: string;
  putObject(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
  }): Promise<unknown>;
  newId(): string;
}

function defaultDependencies(): UploadDependencies {
  const bucket = process.env.TOS_BUCKET || "";
  const client = new TosClient({
    accessKeyId: process.env.TOS_ACCESS_KEY || "",
    accessKeySecret: process.env.TOS_SECRET_KEY || "",
    region: process.env.TOS_REGION || "ap-southeast-1",
    endpoint: process.env.TOS_ENDPOINT || "",
  });
  return {
    store: prismaStore,
    bucket,
    putObject: ({ key, body, contentType }) =>
      client.putObject({ bucket, key, body: Buffer.from(body), contentType }),
    newId: () => randomUUID(),
  };
}

/**
 * Stores a user-uploaded image and records it as an asset they own.
 *
 * The stored key is derived entirely from the user id and a fresh UUID — the
 * uploaded filename is never used, so a crafted name cannot escape the user's
 * prefix or collide with an existing object.
 */
export async function storeUploadedImage(
  userId: string,
  bytes: Uint8Array,
  dependencies: UploadDependencies = defaultDependencies(),
): Promise<AssetRecord> {
  if (bytes.length === 0) {
    throw new InvalidUploadError("File is empty");
  }
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new InvalidUploadError("Image is larger than 15MB");
  }

  const format = detectImageFormat(bytes);
  if (format === null) {
    throw new InvalidUploadError("Only PNG, JPEG, and WebP images are supported");
  }

  const key = `${userId}/uploads/${dependencies.newId()}.${format.extension}`;
  await dependencies.putObject({
    key,
    body: bytes,
    contentType: format.contentType,
  });

  // Recorded only after the object is durably stored, so a failed upload never
  // leaves an asset row pointing at nothing.
  return dependencies.store.asset.createUploaded({
    data: {
      userId,
      type: "image",
      storageUrl: `tos://${dependencies.bucket}/${key}`,
    },
  });
}
