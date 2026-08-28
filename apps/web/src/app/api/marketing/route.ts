import { auth } from "@/auth";
import { planMarketingAd } from "@/server/marketing";
import { MarketingPlanError, MarketingScrapeError } from "@creative-ai/agents";
import { ModelArkHttpError } from "@creative-ai/modelark-client";
import { NextRequest, NextResponse } from "next/server";

const MAX_URL_LENGTH = 2000;

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json();
  const url =
    typeof body === "object" && body !== null && "url" in body
      ? (body as { url: unknown }).url
      : undefined;

  if (typeof url !== "string" || url.trim().length === 0) {
    return NextResponse.json({ error: "url must be a non-empty string" }, { status: 400 });
  }
  if (url.length > MAX_URL_LENGTH) {
    return NextResponse.json(
      { error: `url must be ${MAX_URL_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }

  try {
    const plan = await planMarketingAd(url);
    return NextResponse.json(plan);
  } catch (error) {
    if (error instanceof MarketingScrapeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof MarketingPlanError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    if (error instanceof ModelArkHttpError) {
      return NextResponse.json({ error: "Marketing agent request failed" }, { status: 502 });
    }
    console.error("Marketing planning error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
