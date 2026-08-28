import { randomUUID } from "node:crypto";

import { createVoiceClient, type TranscriptionResult } from "@creative-ai/voice-client";
import { TosClient } from "@volcengine/tos-sdk";

const SIGNED_URL_EXPIRY_SECONDS = 300;
const TRANSCRIPTION_SAMPLE_RATE = 16000;

function tosClient(): TosClient {
  return new TosClient({
    accessKeyId: process.env.TOS_ACCESS_KEY || "",
    accessKeySecret: process.env.TOS_SECRET_KEY || "",
    region: process.env.TOS_REGION || "ap-southeast-1",
    endpoint: process.env.TOS_ENDPOINT || "",
  });
}

function voiceClient() {
  const baseUrl = process.env.BYTEPLUS_VOICE_BASE_URL;
  return createVoiceClient({
    apiKey: process.env.BYTEPLUS_VOICE_API_KEY || "",
    ...(baseUrl ? { baseUrl } : {}),
  });
}

// The client encodes to this exact format before uploading (see
// apps/web/src/app/transcribe/audio-encode.ts) so these values are always accurate --
// they aren't probing an arbitrary uploaded file's real encoding.
export async function submitTranscriptionForAudio(
  userId: string,
  wavBytes: Uint8Array,
): Promise<{ requestId: string }> {
  const bucket = process.env.TOS_BUCKET || "";
  const key = `${userId}/transcriptions/${randomUUID()}.wav`;

  await tosClient().putObject({
    bucket,
    key,
    body: Buffer.from(wavBytes),
    contentType: "audio/wav",
  });

  const audioUrl = tosClient().getPreSignedUrl({
    method: "GET",
    bucket,
    key,
    expires: SIGNED_URL_EXPIRY_SECONDS,
  });

  const result = await voiceClient().submitTranscription({
    user: { uid: userId },
    audio: {
      url: audioUrl,
      language: "en-US",
      format: "wav",
      codec: "raw",
      rate: TRANSCRIPTION_SAMPLE_RATE,
      bits: 16,
      channel: 1,
    },
    request: {
      model_name: "bigmodel",
      enable_itn: true,
      enable_punc: true,
      show_utterances: false,
    },
  });

  return { requestId: result.requestId };
}

export async function getTranscriptionStatus(
  requestId: string,
): Promise<TranscriptionResult> {
  return voiceClient().queryTranscription(requestId);
}
