import { auth } from "@/auth";
import { setAssetPublished } from "@creative-ai/db";
import { NextResponse } from "next/server";

/**
 * Publishes or unpublishes one of the caller's assets.
 *
 * Publishing is per asset and explicit — there is no "publish everything"
 * switch, because a library is generated privately and only some of it is meant
 * to be seen.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    published?: unknown;
  } | null;
  if (typeof body?.published !== "boolean") {
    return NextResponse.json(
      { error: "published must be true or false" },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const updated = await setAssetPublished(id, session.user.id, body.published);
  if (!updated) {
    // Deliberately not 403: a "not yours" would tell a caller that an asset
    // with this id exists.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ published: body.published });
}
