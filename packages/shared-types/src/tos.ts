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
