import { randomUUID } from "node:crypto";

import {
  createVoiceClient,
  type SubmitTranscriptionRequest,
  type TranscriptionResult,
} from "@creative-ai/voice-client";
import { TosClient } from "@volcengine/tos-sdk";

const SIGNED_URL_EXPIRY_SECONDS = 300;
const TRANSCRIPTION_SAMPLE_RATE = 16000;

export interface TranscribeDependencies {
  putObject(input: {
    bucket: string;
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<unknown>;
  signUrl(input: { bucket: string; key: string; expires: number }): string;
  submitTranscription(
    params: SubmitTranscriptionRequest,
  ): Promise<{ requestId: string }>;
  queryTranscription(requestId: string): Promise<TranscriptionResult>;
  bucket: string;
  newId(): string;
}

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

export function defaultTranscribeDependencies(): TranscribeDependencies {
  return {
    putObject: (input) => tosClient().putObject(input),
    signUrl: (input) => tosClient().getPreSignedUrl({ method: "GET", ...input }),
    submitTranscription: (params) => voiceClient().submitTranscription(params),
    queryTranscription: (requestId) => voiceClient().queryTranscription(requestId),
    bucket: process.env.TOS_BUCKET || "",
    newId: () => randomUUID(),
  };
}

// The client encodes to this exact format before uploading (see
// apps/web/src/app/transcribe/audio-encode.ts) so these values are always accurate --
// they aren't probing an arbitrary uploaded file's real encoding.
export async function submitTranscriptionForAudio(
  userId: string,
  wavBytes: Uint8Array,
  dependencies: TranscribeDependencies = defaultTranscribeDependencies(),
): Promise<{ requestId: string }> {
  const bucket = dependencies.bucket;
  // The key is built from the user id and a fresh UUID, never from anything the
  // caller supplies, so one user's audio cannot land under another's prefix.
  const key = `${userId}/transcriptions/${dependencies.newId()}.wav`;

  await dependencies.putObject({
    bucket,
    key,
    body: Buffer.from(wavBytes),
    contentType: "audio/wav",
  });

  // BytePlus fetches the audio itself and cannot read our private bucket, so it
  // gets a short-lived signed URL rather than the tos:// location.
  const audioUrl = dependencies.signUrl({
    bucket,
    key,
    expires: SIGNED_URL_EXPIRY_SECONDS,
  });

  const result = await dependencies.submitTranscription({
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
  dependencies: TranscribeDependencies = defaultTranscribeDependencies(),
): Promise<TranscriptionResult> {
  return dependencies.queryTranscription(requestId);
}
