import { extractText, getDocumentProxy } from "unpdf";

/**
 * Pulling the words out of a PDF.
 *
 * PDFs are accepted because that is the format knowledge arrives in — exports
 * from other tools, style guides, production bibles. Requiring a conversion to
 * plain text first is requiring people not to bother.
 */

/**
 * Large enough for a production bible, small enough that one upload cannot
 * occupy a request for minutes while it is parsed in memory.
 */
export const MAX_PDF_BYTES = 20 * 1_000_000;

export async function extractPdfText(bytes: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  const merged = Array.isArray(text) ? text.join("\n\n") : text;

  const trimmed = merged.trim();
  if (trimmed.length === 0) {
    // A scanned PDF is an image of words, and this reads none of them. Saying so
    // is better than storing an empty document that answers nothing.
    throw new Error("No text layer found");
  }
  return trimmed;
}
