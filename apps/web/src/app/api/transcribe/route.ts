import { auth } from "@/auth";
import { submitTranscriptionForAudio } from "@/server/transcribe";
import { VoiceApiError, VoiceHttpError } from "@creative-ai/voice-client";
import { NextRequest, NextResponse } from "next/server";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // ~5 minutes of 16kHz mono 16-bit PCM WAV

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const audio = formData.get("audio");

  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "audio file is required" }, { status: 400 });
  }
  if (audio.size === 0) {
    return NextResponse.json({ error: "audio file is empty" }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "audio file is too large" }, { status: 400 });
  }

  try {
    const wavBytes = new Uint8Array(await audio.arrayBuffer());
    const { requestId } = await submitTranscriptionForAudio(session.user.id, wavBytes);
    return NextResponse.json({ requestId }, { status: 201 });
  } catch (error) {
    if (error instanceof VoiceHttpError || error instanceof VoiceApiError) {
      console.error("Transcription submit error:", error);
      return NextResponse.json({ error: "Transcription request failed" }, { status: 502 });
    }
    console.error("Transcription submit error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
