/**
 * Splitting a document into retrievable passages.
 *
 * Kept apart from the rest of knowledge.ts, which reaches Prisma and the
 * provider, so the one piece of real logic here can be tested as the pure
 * function it is rather than from behind two network dependencies.
 */

/**
 * Roughly a long paragraph. Large enough that a passage still makes sense on
 * its own, small enough that a handful of them fit in a prompt beside the rest
 * of the system message.
 */
export const CHUNK_SIZE = 900;

/**
 * Passages overlap so a sentence split across a boundary is still retrievable
 * whole from one side of it. Without this, the answer to a question can be the
 * one thing that falls into the crack between two passages.
 */
export const CHUNK_OVERLAP = 150;

/**
 * Splits on paragraph or sentence boundaries where it can, mid-text where it
 * must.
 *
 * Cutting at a blank line keeps a passage readable; cutting at a fixed offset
 * regardless would routinely sever a sentence and store half an idea, which
 * later retrieves as half an answer.
 */
export function chunkText(text: string): string[] {
  const normalised = text.replace(/\r\n/g, "\n").trim();
  if (normalised.length === 0) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < normalised.length) {
    const end = Math.min(start + CHUNK_SIZE, normalised.length);
    let cut = end;

    if (end < normalised.length) {
      const paragraph = normalised.lastIndexOf("\n\n", end);
      const sentence = normalised.lastIndexOf(". ", end);
      const boundary = Math.max(paragraph, sentence);
      // Only honour a boundary that falls in the back half of this passage. One
      // that sits earlier would make passages tiny and multiply what a document
      // costs to embed.
      if (boundary > start + CHUNK_SIZE / 2) cut = boundary + 1;
    }

    const piece = normalised.slice(start, cut).trim();
    if (piece.length > 0) chunks.push(piece);
    if (cut >= normalised.length) break;
    // Always advances, even when no boundary was found, so a pathological
    // document cannot hang the request.
    start = Math.max(cut - CHUNK_OVERLAP, start + 1);
  }

  return chunks;
}
