import { auth } from "@/auth";
import {
  KnowledgeError,
  addDocument,
  deleteDocument,
  listDocuments,
  parseCollection,
  type KnowledgeCollection,
} from "@/server/knowledge";
import { extractPdfText, MAX_PDF_BYTES } from "@/server/pdf-text";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ documents: await listDocuments(session.user.id) });
}

/**
 * Adds a document to the house knowledge.
 *
 * POST rather than PUT because it spends provider tokens: every passage is
 * embedded before it is stored, so this is not a safe, repeatable write.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Two shapes: JSON for pasted text, multipart for a PDF. PDFs are accepted
  // because that is what comes out of the tools this knowledge is gathered in —
  // asking someone to convert every export to text first is asking them not to
  // bother.
  let title: string;
  let text: string;
  let collection: KnowledgeCollection;

  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file was sent" }, { status: 400 });
    }
    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json(
        { error: `PDFs are limited to ${MAX_PDF_BYTES / 1_000_000}MB` },
        { status: 400 },
      );
    }

    try {
      text = await extractPdfText(await file.arrayBuffer());
    } catch (error) {
      console.error("PDF extraction failed:", error);
      return NextResponse.json(
        { error: "That PDF could not be read as text. Is it a scan?" },
        { status: 400 },
      );
    }
    title = String(form.get("title") ?? file.name);
    collection = parseCollection(form.get("collection"));
  } else {
    const body = (await request.json().catch(() => null)) as {
      title?: unknown;
      text?: unknown;
      collection?: unknown;
    } | null;

    if (typeof body?.title !== "string" || typeof body?.text !== "string") {
      return NextResponse.json(
        { error: "A title and the text are both required" },
        { status: 400 },
      );
    }
    title = body.title;
    text = body.text;
    collection = parseCollection(body.collection);
  }

  try {
    return NextResponse.json(
      await addDocument(session.user.id, title, text, collection),
    );
  } catch (error) {
    if (error instanceof KnowledgeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Knowledge ingestion failed:", error);
    return NextResponse.json({ error: "Could not store the document" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (id === null) {
    return NextResponse.json({ error: "Which document?" }, { status: 400 });
  }

  // 404 rather than 403 on someone else's document: "not yours" would confirm
  // it exists.
  return (await deleteDocument(session.user.id, id))
    ? NextResponse.json({ deleted: true })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}
