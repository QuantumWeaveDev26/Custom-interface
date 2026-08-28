import { auth } from "@/auth";
import { planShotsForBrief } from "@/server/director";
import { DirectorPlanError } from "@creative-ai/agents";
import { ModelArkHttpError } from "@creative-ai/modelark-client";
import { NextRequest, NextResponse } from "next/server";

const MAX_BRIEF_LENGTH = 500;

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json();
  const brief =
    typeof body === "object" && body !== null && "brief" in body
      ? (body as { brief: unknown }).brief
      : undefined;

  if (typeof brief !== "string" || brief.trim().length === 0) {
    return NextResponse.json({ error: "brief must be a non-empty string" }, { status: 400 });
  }
  if (brief.length > MAX_BRIEF_LENGTH) {
    return NextResponse.json(
      { error: `brief must be ${MAX_BRIEF_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }

  try {
    const shots = await planShotsForBrief(brief);
    return NextResponse.json({ shots });
  } catch (error) {
    if (error instanceof DirectorPlanError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    if (error instanceof ModelArkHttpError) {
      console.error("Director planning ModelArk error:", error.operation, error.status, error.responseBody);
      return NextResponse.json({ error: "Director agent request failed" }, { status: 502 });
    }
    console.error("Director planning error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
