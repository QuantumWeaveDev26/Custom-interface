import { randomUUID } from "node:crypto";

import { prismaStore, type AssetRecord, type DatabaseStore } from "@creative-ai/db";
import { TosClient } from "@volcengine/tos-sdk";

// 15 MB. Generous for a photo, small enough that a single request cannot tie up
// the server or fill the bucket.
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

// Video needs a far larger ceiling than a photo — a 15-second 1080p clip does
// not fit in 15 MB. The provider's own limit is 200 MB per clip (R4); this sits
// well under it so an upload that passes here cannot be refused upstream for
// size alone.
export const MAX_VIDEO_UPLOAD_BYTES = 100 * 1024 * 1024;

export class InvalidUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidUploadError";
  }
}

interface UploadFormat {
  kind: "image" | "video";
  extension: "png" | "jpg" | "webp" | "mp4" | "mov";
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
export function detectImageFormat(bytes: Uint8Array): UploadFormat | null {
  const startsWith = (...signature: number[]): boolean =>
    signature.every((byte, index) => bytes[index] === byte);

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return { kind: "image", extension: "png", contentType: "image/png" };
  }
  // JPEG: FF D8 FF
  if (startsWith(0xff, 0xd8, 0xff)) {
    return { kind: "image", extension: "jpg", contentType: "image/jpeg" };
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    startsWith(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { kind: "image", extension: "webp", contentType: "image/webp" };
  }
  return null;
}

/**
 * Identifies an MP4 or QuickTime container by its `ftyp` box.
 *
 * Unlike an image, a video file has no signature at offset 0: the first four
 * bytes are the box length. The type tag sits at offset 4, and the brand that
 * follows separates QuickTime from MP4.
 */
export function detectVideoFormat(bytes: Uint8Array): UploadFormat | null {
  if (bytes.length < 12) return null;

  const tag = String.fromCharCode(bytes[4]!, bytes[5]!, bytes[6]!, bytes[7]!);
  if (tag !== "ftyp") return null;

  const brand = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
  if (brand.startsWith("qt")) {
    return { kind: "video", extension: "mov", contentType: "video/quicktime" };
  }
  // isom, iso2, mp41, mp42, avc1, dash and friends are all MP4 brands. The
  // provider accepts H.264/H.265 in an MP4 container; the exact brand does not
  // change that, so anything else with an ftyp box is treated as MP4 rather
  // than rejected on a brand allowlist that would age badly.
  return { kind: "video", extension: "mp4", contentType: "video/mp4" };
}

export function detectUploadFormat(bytes: Uint8Array): UploadFormat | null {
  return detectImageFormat(bytes) ?? detectVideoFormat(bytes);
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
 * Stores a user-uploaded image or video and records it as an asset they own.
 *
 * The stored key is derived entirely from the user id and a fresh UUID — the
 * uploaded filename is never used, so a crafted name cannot escape the user's
 * prefix or collide with an existing object.
 *
 * The format is decided by magic bytes, so the size limit can only be applied
 * after the kind is known: a 40 MB file is a valid clip and an invalid photo.
 */
export async function storeUploadedImage(
  userId: string,
  bytes: Uint8Array,
  dependencies: UploadDependencies = defaultDependencies(),
): Promise<AssetRecord> {
  if (bytes.length === 0) {
    throw new InvalidUploadError("File is empty");
  }

  const format = detectUploadFormat(bytes);
  if (format === null) {
    throw new InvalidUploadError(
      "Only PNG, JPEG, and WebP images and MP4 or MOV video are supported",
    );
  }

  const limit = format.kind === "video" ? MAX_VIDEO_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
  if (bytes.length > limit) {
    throw new InvalidUploadError(
      format.kind === "video"
        ? "Video is larger than 100MB"
        : "Image is larger than 15MB",
    );
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
      type: format.kind,
      storageUrl: `tos://${dependencies.bucket}/${key}`,
    },
  });
}
