import { auth } from "@/auth";
import { getTranscriptionStatus } from "@/server/transcribe";
import { VoiceApiError, VoiceHttpError } from "@creative-ai/voice-client";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { requestId } = await params;

  try {
    const result = await getTranscriptionStatus(requestId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof VoiceHttpError || error instanceof VoiceApiError) {
      console.error("Transcription query error:", error);
      return NextResponse.json({ error: "Transcription status request failed" }, { status: 502 });
    }
    console.error("Transcription query error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
