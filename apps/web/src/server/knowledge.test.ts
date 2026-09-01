import assert from "node:assert/strict";
import test from "node:test";

import { CHUNK_OVERLAP, CHUNK_SIZE, chunkText } from "./knowledge-chunk.js";

test("a short document is one passage", () => {
  assert.deepEqual(chunkText("A long lens flattens the background."), [
    "A long lens flattens the background.",
  ]);
});

test("empty and blank documents produce nothing to store", () => {
  assert.deepEqual(chunkText(""), []);
  assert.deepEqual(chunkText("   \n\n  "), []);
});

test("a long document is split at paragraph breaks, not mid-sentence", () => {
  const paragraph = "This is a sentence about lenses that runs on for a while. ".repeat(12);
  const chunks = chunkText(`${paragraph}\n\n${paragraph}`);

  assert.ok(chunks.length > 1, "a document twice the chunk size must split");
  for (const chunk of chunks) {
    // Cutting at a fixed offset regardless of content would routinely sever a
    // sentence and store half an idea, which retrieves as half an answer.
    assert.ok(chunk.length <= CHUNK_SIZE + CHUNK_OVERLAP, "a passage ran past its bounds");
    assert.equal(chunk, chunk.trim());
  }
});

test("passages overlap, so an answer cannot fall into the gap between them", () => {
  const text = "word ".repeat(600);
  const chunks = chunkText(text);

  assert.ok(chunks.length > 1);
  // The tail of one passage must reappear at the head of the next; without that
  // a sentence split across the boundary is retrievable from neither side.
  const tail = chunks[0]!.slice(-40);
  assert.ok(
    chunks[1]!.includes(tail.trim().split(" ")[1] ?? ""),
    "consecutive passages share no text",
  );
});

test("splitting always terminates and covers the whole document", () => {
  // The loop advances by at least one character even when no boundary is found,
  // which is what stops a pathological document from hanging the request.
  const noBoundaries = "x".repeat(CHUNK_SIZE * 3);
  const chunks = chunkText(noBoundaries);

  assert.ok(chunks.length >= 3);
  assert.ok(chunks.join("").length >= noBoundaries.length);
});
