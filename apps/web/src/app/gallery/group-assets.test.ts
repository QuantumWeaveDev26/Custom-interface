import assert from "node:assert/strict";
import test from "node:test";

import {
  groupAssets,
  filmOf,
  parseGalleryFilter,
  toGalleryRows,
  type GalleryAsset,
} from "./group-assets.js";

const AT = new Date("2026-08-29T00:00:00.000Z");

function asset(id: string, jobId: string | null, type = "image"): GalleryAsset {
  return { id, type, jobId, createdAt: AT, published: false, kind: null };
}

test("assets from one job become one set", () => {
  const groups = groupAssets([
    asset("a", "job-1"),
    asset("b", "job-1"),
    asset("c", "job-1"),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.assets.length, 3);
  assert.equal(groups[0]?.key, "job-1");
});

test("uploads each stand alone rather than collapsing into one set", () => {
  // Uploads have no job. Grouping on a null jobId would fold a user's entire
  // upload history into a single card.
  const groups = groupAssets([asset("u1", null), asset("u2", null)]);

  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((group) => group.key),
    ["u1", "u2"],
  );
});

test("input order decides both set order and order within a set", () => {
  const groups = groupAssets([
    asset("newest", "job-2"),
    asset("older-a", "job-1"),
    asset("upload", null),
    asset("older-b", "job-1"),
  ]);

  // job-1's second asset joins the set already placed, rather than starting a
  // new one further down — otherwise a batch would appear twice.
  assert.deepEqual(
    groups.map((group) => group.key),
    ["job-2", "job-1", "upload"],
  );
  assert.deepEqual(groups[1]?.assets.map((item) => item.id), ["older-a", "older-b"]);
});

test("an empty library groups to nothing", () => {
  assert.deepEqual(groupAssets([]), []);
});

test("an unknown filter falls back to all rather than showing nothing", () => {
  // The filter arrives from a query string, so it is caller-controlled. An
  // empty gallery reads as data loss.
  assert.equal(parseGalleryFilter("model3d"), "model3d");
  assert.equal(parseGalleryFilter("nonsense"), "all");
  assert.equal(parseGalleryFilter(undefined), "all");
});

test("consecutive singles share one grid and a set breaks the run", () => {
  const rows = toGalleryRows(
    groupAssets([
      asset("s1", null),
      asset("s2", null),
      asset("b1", "job-1"),
      asset("b2", "job-1"),
      asset("s3", null),
    ]),
  );

  assert.deepEqual(
    rows.map((row) => `${row.kind}:${row.assets.length}`),
    ["grid:2", "set:2", "grid:1"],
  );
});

test("a library of only singles is one grid, not many", () => {
  // One grid per asset would put a single tile on every row.
  const rows = toGalleryRows(groupAssets([asset("a", null), asset("b", null)]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.kind, "grid");
});

test("a film is separated from the clips it was made from", () => {
  const group = {
    key: "job-1",
    assets: [
      { ...asset("cut", "job-1", "video"), kind: "film" },
      { ...asset("a", "job-1", "video"), kind: "clip" },
      { ...asset("b", "job-1", "video"), kind: "clip" },
      { ...asset("frame", "job-1", "image"), kind: null },
    ],
  };

  const film = filmOf(group);

  // The cut and its parts arrive as one job, but they are not peers. Showing
  // them as equal tiles buries the only one that was asked for.
  assert.equal(film?.film.id, "cut");
  assert.deepEqual(film?.clips.map((clip) => clip.id), ["a", "b"]);
});

test("an ordinary batch is not a film", () => {
  // A set of images shares a job too. Without a labelled cut there is nothing
  // to promote, and guessing from position would promote the first image.
  assert.equal(
    filmOf({ key: "job-2", assets: [asset("x", "job-2"), asset("y", "job-2")] }),
    null,
  );
});
