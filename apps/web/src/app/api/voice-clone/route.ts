import { auth } from "@/auth";
import { cloneVoiceFromAudio } from "@/server/voice-clone";
import { VoiceHttpError } from "@creative-ai/voice-client";
import { NextRequest, NextResponse } from "next/server";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const audio = formData.get("audio");
  const consent = formData.get("consent");

  if (consent !== "true") {
    return NextResponse.json(
      { error: "Consent confirmation is required to clone a voice" },
      { status: 400 },
    );
  }
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
    const outcome = await cloneVoiceFromAudio(session.user.id, wavBytes);
    return NextResponse.json(outcome, { status: 201 });
  } catch (error) {
    if (error instanceof VoiceHttpError) {
      console.error("Voice clone error:", error);
      return NextResponse.json({ error: "Voice cloning request failed" }, { status: 502 });
    }
    console.error("Voice clone error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
