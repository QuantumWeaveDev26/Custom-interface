import { randomUUID } from "node:crypto";

import { VoiceApiError, VoiceHttpError, VoiceResponseShapeError } from "./errors.js";
import type {
  CloneVoiceRequest,
  CreateAudioGenerationRequest,
  CreateSpeechRequest,
  CreateSpeechResult,
  SubmitTranscriptionRequest,
  SubmitTranscriptionResult,
} from "./types.js";

const DEFAULT_BASE_URL = "https://voice.ap-southeast-1.bytepluses.com/api/v3";
const DEFAULT_RESOURCE_ID = "seed-tts-2.0";
const ASR_RESOURCE_ID = "volc.seedasr.auc";

export interface VoiceClientConfig {
  apiKey: string;
  baseUrl?: string;
  resourceId?: string;
  fetch?: typeof globalThis.fetch;
  generateRequestId?: () => string;
}

export interface VoiceClient {
  createSpeech(params: CreateSpeechRequest): Promise<CreateSpeechResult>;
  createAudioGeneration(
    params: CreateAudioGenerationRequest,
  ): Promise<CreateSpeechResult>;
  cloneVoice(params: CloneVoiceRequest): Promise<unknown>;
  submitTranscription(
    params: SubmitTranscriptionRequest,
  ): Promise<SubmitTranscriptionResult>;
  queryTranscription(requestId: string): Promise<unknown>;
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
  const generateRequestId = config.generateRequestId ?? randomUUID;

  async function parseAudioResponse(
    response: Response,
  ): Promise<CreateSpeechResult> {
    const contentType = response.headers.get("content-type") ?? "";
    const buffer = await response.arrayBuffer();

    // Confirmed live: BytePlus Voice's Content-Type header says "text/plain" even
    // when the body is genuinely JSON -- don't trust the header, try JSON first
    // regardless of what it claims, and only fall back to raw bytes if that fails.
    const text = new TextDecoder().decode(buffer);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }

    if (typeof parsed === "object" && parsed !== null) {
      const body = parsed as { code?: unknown; message?: unknown; data?: unknown };
      if (typeof body.code === "number" && body.code !== 0) {
        throw new VoiceApiError(body.code, typeof body.message === "string" ? body.message : "");
      }
      if (typeof body.data === "string" && body.data.length > 0) {
        return { audio: base64ToBytes(body.data), contentType: "audio/mpeg" };
      }
      throw new VoiceResponseShapeError(contentType, JSON.stringify(body).slice(0, 500));
    }

    if (contentType.startsWith("audio/")) {
      return { audio: new Uint8Array(buffer), contentType };
    }

    throw new VoiceResponseShapeError(contentType, text.slice(0, 500));
  }

  async function requestJson<T>(
    path: string,
    headers: Record<string, string>,
    body: unknown,
  ): Promise<T> {
    const response = await fetchImplementation(`${baseUrl}${path}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const responseBody = (await response.text()).slice(0, 1_000);
      throw new VoiceHttpError(response.status, responseBody);
    }

    return (await response.json()) as T;
  }

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

    return parseAudioResponse(response);
  }

  async function createAudioGeneration(
    params: CreateAudioGenerationRequest,
  ): Promise<CreateSpeechResult> {
    const response = await fetchImplementation(`${baseUrl}/tts/create`, {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const responseBody = (await response.text()).slice(0, 1_000);
      throw new VoiceHttpError(response.status, responseBody);
    }

    return parseAudioResponse(response);
  }

  async function cloneVoice(params: CloneVoiceRequest): Promise<unknown> {
    return requestJson(
      "/tts/voice_clone",
      {
        "X-Api-Key": apiKey,
        "X-Api-Request-Id": generateRequestId(),
      },
      params,
    );
  }

  async function submitTranscription(
    params: SubmitTranscriptionRequest,
  ): Promise<SubmitTranscriptionResult> {
    const requestId = generateRequestId();
    const raw = await requestJson(
      "/auc/bigmodel/submit",
      {
        "x-api-key": apiKey,
        "X-Api-Resource-Id": ASR_RESOURCE_ID,
        "X-Api-Request-Id": requestId,
        "X-Api-Sequence": "-1",
      },
      params,
    );
    return { requestId, raw };
  }

  async function queryTranscription(requestId: string): Promise<unknown> {
    return requestJson(
      "/auc/bigmodel/query",
      {
        "x-api-key": apiKey,
        "X-Api-Resource-Id": ASR_RESOURCE_ID,
        "X-Api-Request-Id": requestId,
      },
      {},
    );
  }

  return {
    createSpeech,
    createAudioGeneration,
    cloneVoice,
    submitTranscription,
    queryTranscription,
  };
}
