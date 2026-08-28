import { VoiceHttpError, VoiceResponseShapeError } from "./errors.js";
import type { CreateSpeechRequest, CreateSpeechResult } from "./types.js";

const DEFAULT_BASE_URL = "https://voice.ap-southeast-1.bytepluses.com/api/v3";
const DEFAULT_RESOURCE_ID = "seed-tts-2.0";

export interface VoiceClientConfig {
  apiKey: string;
  baseUrl?: string;
  resourceId?: string;
  fetch?: typeof globalThis.fetch;
}

export interface VoiceClient {
  createSpeech(params: CreateSpeechRequest): Promise<CreateSpeechResult>;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function createVoiceClient(config: VoiceClientConfig): VoiceClient {
  const apiKey = config.apiKey.trim();
  if (apiKey.length === 0) {
    throw new Error("BYTEPLUS_VOICE_API_KEY is not set");
  }

  const fetchImplementation = config.fetch ?? globalThis.fetch;
  if (fetchImplementation === undefined) {
    throw new Error("Voice client requires a fetch implementation");
  }

  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const resourceId = config.resourceId ?? DEFAULT_RESOURCE_ID;

  async function createSpeech(
    params: CreateSpeechRequest,
  ): Promise<CreateSpeechResult> {
    const response = await fetchImplementation(`${baseUrl}/tts/unidirectional`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "X-Api-Resource-Id": resourceId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const responseBody = (await response.text()).slice(0, 1_000);
      throw new VoiceHttpError(response.status, responseBody);
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.startsWith("audio/")) {
      const audio = new Uint8Array(await response.arrayBuffer());
      return { audio, contentType };
    }

    if (contentType.includes("application/json")) {
      const body = (await response.json()) as { data?: unknown };
      if (typeof body.data === "string" && body.data.length > 0) {
        return { audio: base64ToBytes(body.data), contentType: "audio/mpeg" };
      }
      throw new VoiceResponseShapeError(contentType, JSON.stringify(body).slice(0, 500));
    }

    const bodyPreview = (await response.text()).slice(0, 500);
    throw new VoiceResponseShapeError(contentType, bodyPreview);
  }

  return { createSpeech };
}
