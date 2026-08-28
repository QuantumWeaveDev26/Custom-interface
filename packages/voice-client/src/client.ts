import { randomUUID } from "node:crypto";

import { VoiceApiError, VoiceHttpError, VoiceResponseShapeError } from "./errors.js";
import type {
  CloneVoiceRequest,
  CloneVoiceResult,
  CreateAudioGenerationRequest,
  CreateSpeechRequest,
  CreateSpeechResult,
  SubmitTranscriptionRequest,
  SubmitTranscriptionResult,
  TranscriptionResult,
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
  cloneVoice(params: CloneVoiceRequest): Promise<CloneVoiceResult>;
  submitTranscription(
    params: SubmitTranscriptionRequest,
  ): Promise<SubmitTranscriptionResult>;
  queryTranscription(requestId: string): Promise<TranscriptionResult>;
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

    // A content type that genuinely says audio/* is trusted immediately, before
    // attempting to interpret the body as text/JSON at all.
    if (contentType.startsWith("audio/")) {
      return { audio: new Uint8Array(buffer), contentType };
    }

    // Confirmed live: despite the "unidirectional" endpoint name, the body is
    // NDJSON (newline-delimited JSON), not one JSON value -- a run of chunks
    // {code:0, data:"<base64>"} to concatenate, then a {code:0, data:null}
    // marker, then a final {code:20000000, data:null} completion marker.
    // Content-Type also says "text/plain" even though the body is JSON lines.
    const text = new TextDecoder().decode(buffer);
    const lines = text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);

    if (lines.length === 0) {
      throw new VoiceResponseShapeError(contentType, text.slice(0, 500));
    }

    const chunks: Uint8Array[] = [];
    for (const line of lines) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        throw new VoiceResponseShapeError(contentType, text.slice(0, 500));
      }
      if (typeof parsed !== "object" || parsed === null) {
        throw new VoiceResponseShapeError(contentType, text.slice(0, 500));
      }

      // tts/unidirectional (createSpeech) carries each chunk under "data"; tts/create
      // (createAudioGeneration) is a genuinely different envelope -- one JSON object,
      // real application/json, with the whole clip under "audio" instead.
      const body = parsed as { code?: unknown; message?: unknown; data?: unknown; audio?: unknown };
      if (typeof body.data === "string" && body.data.length > 0) {
        chunks.push(base64ToBytes(body.data));
        continue;
      }
      if (typeof body.audio === "string" && body.audio.length > 0) {
        chunks.push(base64ToBytes(body.audio));
        continue;
      }
      // A line with no data is either a benign end-of-stream marker (observed
      // codes 0 and 20000000) or a genuine API-level error -- only the latter
      // has a code outside that confirmed pair, so only that throws.
      if (typeof body.code === "number" && body.code !== 0 && body.code !== 20_000_000) {
        throw new VoiceApiError(body.code, typeof body.message === "string" ? body.message : "");
      }
    }

    if (chunks.length === 0) {
      throw new VoiceResponseShapeError(contentType, text.slice(0, 500));
    }

    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const audio = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      audio.set(chunk, offset);
      offset += chunk.length;
    }

    return { audio, contentType: "audio/mpeg" };
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
      throw new VoiceHttpError(path, response.status, responseBody);
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
      throw new VoiceHttpError("tts/unidirectional", response.status, responseBody);
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
      throw new VoiceHttpError("tts/create", response.status, responseBody);
    }

    return parseAudioResponse(response);
  }

  async function cloneVoice(params: CloneVoiceRequest): Promise<CloneVoiceResult> {
    // Confirmed via official BytePlus docs (docs.byteplus.com/en/docs/byteplusvoice/
    // voicereplication-v3-voice-training) -- not yet exercised by a real live call, so
    // treat this shape as high-confidence but unverified until a real response is seen.
    const raw = await requestJson<{
      speaker_id?: string;
      status?: number;
      available_training_times?: number;
      speaker_status?: Array<{ demo_audio?: string }>;
    }>(
      "/tts/voice_clone",
      {
        "X-Api-Key": apiKey,
        "X-Api-Request-Id": generateRequestId(),
      },
      params,
    );

    return {
      speakerId: raw.speaker_id ?? "",
      status: raw.status ?? 0,
      availableTrainingTimes: raw.available_training_times ?? 0,
      demoAudioUrl: raw.speaker_status?.[0]?.demo_audio ?? null,
    };
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

  async function queryTranscription(requestId: string): Promise<TranscriptionResult> {
    const response = await fetchImplementation(`${baseUrl}/auc/bigmodel/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "X-Api-Resource-Id": ASR_RESOURCE_ID,
        "X-Api-Request-Id": requestId,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const responseBody = (await response.text()).slice(0, 1_000);
      throw new VoiceHttpError("auc/bigmodel/query", response.status, responseBody);
    }

    // Confirmed live 2026-08-28: unlike everything else in Seed Speech, the real job
    // status here isn't in the JSON body at all -- it's the "x-api-status-code" response
    // header. The body only ever carries { audio_info, result: { text, additions } }.
    const statusCodeHeader = response.headers.get("x-api-status-code");
    const statusCode = statusCodeHeader === null ? NaN : Number(statusCodeHeader);
    const apiMessage = response.headers.get("x-api-message") ?? "";
    const bodyText = await response.text();

    if (statusCode === 20_000_001) {
      return { status: "processing", text: null };
    }
    if (statusCode === 20_000_003) {
      return { status: "no_speech", text: "" };
    }
    if (statusCode === 20_000_000) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        throw new VoiceResponseShapeError(
          response.headers.get("content-type") ?? "",
          bodyText.slice(0, 500),
        );
      }
      const body = parsed as { result?: { text?: unknown } };
      const text = typeof body.result?.text === "string" ? body.result.text : "";
      return { status: "complete", text };
    }

    throw new VoiceApiError(statusCode, apiMessage);
  }

  return {
    createSpeech,
    createAudioGeneration,
    cloneVoice,
    submitTranscription,
    queryTranscription,
  };
}
