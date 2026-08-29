import { auth } from "@/auth";
import { semanticSearchDependencies } from "@/server/semantic-search-dependencies";
import { findSimilarAssets, searchAssets } from "@/server/semantic-search";
import { prisma } from "@creative-ai/db";
import { NextRequest, NextResponse } from "next/server";

const MAX_RESULTS = 24;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("q");
  const similarTo = request.nextUrl.searchParams.get("similarTo");

  try {
    const dependencies = semanticSearchDependencies();
    const hits =
      similarTo !== null
        ? await findSimilarAssets(
            dependencies,
            session.user.id,
            similarTo,
            MAX_RESULTS,
          )
        : await searchAssets(
            dependencies,
            session.user.id,
            query ?? "",
            MAX_RESULTS,
          );

    if (hits.length === 0) return NextResponse.json({ results: [] });

    // Ownership is already implied — the vectors were loaded by userId — but
    // the asset read is scoped again so a stale embedding row cannot leak an
    // asset that has since changed hands or been deleted.
    const assets = await prisma.asset.findMany({
      where: {
        id: { in: hits.map((hit) => hit.assetId) },
        userId: session.user.id,
      },
      select: { id: true, type: true, createdAt: true },
    });
    const byId = new Map(assets.map((asset) => [asset.id, asset]));

    // findMany does not preserve the ranking, so results are rebuilt in hit
    // order — the ranking is the entire point of the feature.
    const results = hits.flatMap((hit) => {
      const asset = byId.get(hit.assetId);
      return asset === undefined
        ? []
        : [{ id: asset.id, type: asset.type, score: hit.score }];
    });

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Semantic search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
