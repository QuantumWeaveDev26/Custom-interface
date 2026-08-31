import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Resolved from this file's own compiled location so the test cannot pass or
// fail depending on the directory it was run from.
const SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "src", "feed.ts"),
  "utf8",
);

/**
 * The feed is the one query in the app that returns other people's rows, so
 * what it selects is a privacy boundary rather than a preference.
 *
 * Structural because the failure worth catching is a later `select` gaining a
 * field — someone adding `user: { select: { name: true } }` to show a byline
 * would not break any behavioural test, it would just start publishing names.
 */
test("the feed selects nothing that identifies who made an asset", () => {
  const select = SOURCE.slice(SOURCE.indexOf("loadFeed"));

  for (const identifying of ["userId", "user:", "email"]) {
    assert.ok(
      !select.includes(identifying),
      `loadFeed must not select ${identifying}`,
    );
  }
});

test("unpublishing clears the timestamp rather than recording a new one", () => {
  // publishedAt is both the flag and the sort key. Writing a date on unpublish
  // would leave the asset in the feed query, ordered as if freshly shared.
  assert.ok(
    SOURCE.includes("publishedAt: published ? new Date() : null"),
    "setAssetPublished must null publishedAt when unpublishing",
  );
});

test("ownership is part of the update, not a separate read", () => {
  assert.ok(
    SOURCE.includes("where: { id: assetId, userId }"),
    "setAssetPublished must scope its update to the owner",
  );
});
