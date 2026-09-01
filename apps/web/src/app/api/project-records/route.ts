import { auth } from "@/auth";
import { KnowledgeError } from "@/server/knowledge";
import { parseRecordKind } from "@/server/project-record-text";
import { deleteRecord, listRecords, saveRecord } from "@/server/project-records";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ records: await listRecords(session.user.id) });
}

/**
 * Saves one record of the film.
 *
 * POST rather than PUT because it embeds the record's text as part of storing
 * it — provider tokens are spent, so this is not a safe repeatable write.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    kind?: unknown;
    name?: unknown;
    summary?: unknown;
    fields?: unknown;
  } | null;

  const kind = parseRecordKind(body?.kind);
  if (kind === null) {
    return NextResponse.json(
      { error: "kind must be character, location, or prop" },
      { status: 400 },
    );
  }
  if (typeof body?.name !== "string" || typeof body?.summary !== "string") {
    return NextResponse.json(
      { error: "A name and a one-line summary are both required" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await saveRecord(session.user.id, kind, body.name, body.summary, body.fields),
    );
  } catch (error) {
    if (error instanceof KnowledgeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Saving a project record failed:", error);
    return NextResponse.json({ error: "Could not save it" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (id === null) {
    return NextResponse.json({ error: "Which record?" }, { status: 400 });
  }

  // 404 rather than 403 on someone else's record: "not yours" confirms it exists.
  return (await deleteRecord(session.user.id, id))
    ? NextResponse.json({ deleted: true })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}
