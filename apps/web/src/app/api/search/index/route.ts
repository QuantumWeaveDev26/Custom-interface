import { auth } from "@/auth";
import { indexUserAssets } from "@/server/semantic-search-dependencies";
import { NextResponse } from "next/server";

/**
 * Indexes a capped batch of the user's assets for semantic search.
 *
 * POST rather than GET because it spends provider tokens and writes rows — it
 * is not a safe, repeatable read.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await indexUserAssets(session.user.id));
  } catch (error) {
    console.error("Asset indexing error:", error);
    return NextResponse.json({ error: "Indexing failed" }, { status: 500 });
  }
}
