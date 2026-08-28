import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidCharacterError,
  MAX_CHARACTER_NAME_LENGTH,
  MAX_CHARACTER_REFERENCES,
  parseAssetIds,
  parseCharacterName,
} from "./characters.js";

test("accepts and trims a valid name", () => {
  assert.equal(parseCharacterName("  Naveen  "), "Naveen");
});

test("rejects empty, whitespace-only, non-string, and over-long names", () => {
  for (const value of ["", "   ", null, 42, {}, "x".repeat(MAX_CHARACTER_NAME_LENGTH + 1)]) {
    assert.throws(() => parseCharacterName(value), InvalidCharacterError);
  }
});

test("accepts a name at the length boundary", () => {
  const name = "x".repeat(MAX_CHARACTER_NAME_LENGTH);
  assert.equal(parseCharacterName(name), name);
});

test("accepts a list of asset ids and preserves order", () => {
  assert.deepEqual(parseAssetIds(["b", "a", "c"]), ["b", "a", "c"]);
});

test("rejects an empty or non-array reference list", () => {
  for (const value of [[], null, "asset-1", {}]) {
    assert.throws(() => parseAssetIds(value), InvalidCharacterError);
  }
});

test("rejects duplicate references", () => {
  // A duplicate would shift every later reference's number in the prompt.
  assert.throws(() => parseAssetIds(["a", "b", "a"]), InvalidCharacterError);
});

test("rejects more references than a job can accept", () => {
  const tooMany = Array.from({ length: MAX_CHARACTER_REFERENCES + 1 }, (_, i) => `a${i}`);
  assert.throws(() => parseAssetIds(tooMany), InvalidCharacterError);
});

test("rejects malformed entries inside the list", () => {
  for (const value of [[""], ["  "], [1], [null], [{}]]) {
    assert.throws(() => parseAssetIds(value), InvalidCharacterError);
  }
});
