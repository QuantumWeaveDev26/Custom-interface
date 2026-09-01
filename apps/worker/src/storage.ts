import { randomUUID } from "node:crypto";

import { parseTosUrl } from "@creative-ai/shared-types";

import type { AssetStorage, StorageUploadInput } from "./contracts.js";

export { parseTosUrl };
export type { ParsedTosUrl } from "@creative-ai/shared-types";

export interface TosPutObjectInput {
  bucket: string;
  key: string;
  body: Uint8Array;
  contentType: string;
}

export interface TosStorageClient {
  putObject(input: TosPutObjectInput): Promise<unknown>;
}

export interface TosStorageConfig {
  bucket: string;
  client: TosStorageClient;
  randomId?: () => string;
}

const BUCKET_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;
const KEY_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

function requireKeySegment(value: string, name: string): string {
  if (!KEY_SEGMENT_PATTERN.test(value) || value === "." || value === "..") {
    throw new Error(`Invalid TOS ${name}`);
  }
  return value;
}

// A glb file begins with the ASCII magic "glTF" (glTF binary container).
const GLB_MAGIC = "glTF";

function extensionFor(
  input: StorageUploadInput,
): "png" | "jpg" | "mp4" | "mp3" | "glb" {
  if (input.type === "image" && input.contentType === "image/png") return "png";
  // Generated images come back as PNG, but the last frame of a video comes back
  // as JPEG — measured 2026-09-01, after a real chain stored its clips and then
  // dropped its closing still with "Unsupported image content type".
  if (input.type === "image" && input.contentType === "image/jpeg") return "jpg";
  if (input.type === "video" && input.contentType === "video/mp4") return "mp4";
  if (input.type === "audio" && input.contentType === "audio/mpeg") return "mp3";
  if (input.type === "model3d") {
    // The provider serves meshes as "binary/octet-stream", which says nothing
    // about the format. The magic bytes do, so they are what is checked — the
    // same reasoning as the upload path in C3.
    const magic = Buffer.from(input.body.subarray(0, 4)).toString("ascii");
    if (magic !== GLB_MAGIC) {
      throw new Error(`Expected a glb mesh, got magic bytes ${JSON.stringify(magic)}`);
    }
    return "glb";
  }
  throw new Error(`Unsupported ${input.type} content type`);
}

export function createTosStorage(config: TosStorageConfig): AssetStorage {
  if (!BUCKET_PATTERN.test(config.bucket)) {
    throw new Error("Invalid TOS bucket");
  }

  const nextRandomId = config.randomId ?? (() => randomUUID());

  return {
    async upload(input) {
      const userId = requireKeySegment(input.userId, "user ID");
      const jobId = requireKeySegment(input.jobId, "job ID");
      const randomId = requireKeySegment(nextRandomId(), "random ID");
      const extension = extensionFor(input);
      const key = `${userId}/${jobId}/${input.type}-${randomId}.${extension}`;

      await config.client.putObject({
        bucket: config.bucket,
        key,
        body: input.body,
        contentType: input.contentType,
      });

      return `tos://${config.bucket}/${key}`;
    },
  };
}

