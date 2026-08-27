import { randomUUID } from "node:crypto";

import type { AssetStorage, StorageUploadInput } from "./contracts.js";

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

export interface ParsedTosUrl {
  bucket: string;
  key: string;
}

const BUCKET_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;
const KEY_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

function invalidTosUrl(): never {
  throw new Error("Invalid TOS URL");
}

export function parseTosUrl(value: string): ParsedTosUrl {
  const match = /^tos:\/\/([^/]+)\/(.+)$/.exec(value);
  if (!match) return invalidTosUrl();

  const [, bucket, key] = match;
  if (!bucket || !key || !BUCKET_PATTERN.test(bucket)) return invalidTosUrl();

  const segments = key.split("/");
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        !KEY_SEGMENT_PATTERN.test(segment),
    )
  ) {
    return invalidTosUrl();
  }

  return { bucket, key };
}

function requireKeySegment(value: string, name: string): string {
  if (!KEY_SEGMENT_PATTERN.test(value) || value === "." || value === "..") {
    throw new Error(`Invalid TOS ${name}`);
  }
  return value;
}

function extensionFor(input: StorageUploadInput): "png" | "mp4" {
  if (input.type === "image" && input.contentType === "image/png") return "png";
  if (input.type === "video" && input.contentType === "video/mp4") return "mp4";
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

