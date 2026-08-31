import { auth } from "@/auth";
import { setAutoIndex } from "@creative-ai/db";
import { NextResponse } from "next/server";

/**
 * Turns index-on-completion on or off for the signed-in user.
 *
 * The flag is read by the worker after each job completes. It is off by default
 * because indexing spends provider tokens per asset, and a user who never
 * searches should not pay for a search index.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    enabled?: unknown;
  } | null;
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json(
      { error: "enabled must be true or false" },
      { status: 400 },
    );
  }

  await setAutoIndex(session.user.id, body.enabled);
  return NextResponse.json({ enabled: body.enabled });
}
