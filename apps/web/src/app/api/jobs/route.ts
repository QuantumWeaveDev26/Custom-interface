import { auth } from "@/auth";
import { submitGenerationJob } from "@/server/jobs";
import { InsufficientCreditsError, InFlightLimitError } from "@creative-ai/db";
import { InvalidJobRequest } from "@creative-ai/shared-types";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: unknown = await request.json();
    const result = await submitGenerationJob(session.user.id, body);

    return NextResponse.json(
      {
        jobId: result.job.id,
        status: result.job.status,
        creditsCost: result.job.creditsCost,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof InvalidJobRequest) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof InsufficientCreditsError) {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
    }
    if (error instanceof InFlightLimitError) {
      return NextResponse.json({ error: "Too many jobs in progress" }, { status: 429 });
    }
    console.error("Job submission error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
