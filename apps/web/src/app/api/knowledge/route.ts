import { auth } from "@/auth";
import {
  KnowledgeError,
  addDocument,
  deleteDocument,
  listDocuments,
} from "@/server/knowledge";
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

  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    text?: unknown;
  } | null;

  if (typeof body?.title !== "string" || typeof body?.text !== "string") {
    return NextResponse.json(
      { error: "A title and the text are both required" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await addDocument(session.user.id, body.title, body.text),
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
