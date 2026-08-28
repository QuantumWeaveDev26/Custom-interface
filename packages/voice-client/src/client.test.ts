import assert from "node:assert/strict";
import test from "node:test";

import { createVoiceClient } from "./client.js";
import { VoiceHttpError, VoiceResponseShapeError } from "./errors.js";

const BASE_URL = "https://voice.example.test/api/v3";

function asFetch(
  implementation: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>,
): typeof globalThis.fetch {
  return implementation as typeof globalThis.fetch;
}

test("factory validates configuration only when invoked", () => {
  assert.throws(
    () => createVoiceClient({ apiKey: "" }),
    /BYTEPLUS_VOICE_API_KEY is not set/,
  );
});

test("createSpeech posts with x-api-key and X-Api-Resource-Id headers", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const audioBytes = new Uint8Array([1, 2, 3, 4]);
  const client = createVoiceClient({
    apiKey: "secret-key",
    baseUrl: `${BASE_URL}/`,
    fetch: asFetch(async (input, init) => {
      calls.push({ input: String(input), ...(init === undefined ? {} : { init }) });
      return new Response(audioBytes, {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      });
    }),
  });

  const request = {
    req_params: {
      text: "Hello world",
      speaker: "en_female_stokie_uranus_bigtts",
      audio_params: { format: "mp3" as const, sample_rate: 24000 },
    },
  };

  const result = await client.createSpeech(request);

  assert.deepEqual(Array.from(result.audio), [1, 2, 3, 4]);
  assert.equal(result.contentType, "audio/mpeg");
  assert.equal(calls[0]?.input, `${BASE_URL}/tts/unidirectional`);
  assert.equal(calls[0]?.init?.method, "POST");
  const headers = new Headers(calls[0]?.init?.headers);
  assert.equal(headers.get("x-api-key"), "secret-key");
  assert.equal(headers.get("X-Api-Resource-Id"), "seed-tts-2.0");
  assert.equal(calls[0]?.init?.body, JSON.stringify(request));
});

test("createSpeech uses a custom resource ID when provided", async () => {
  let capturedResourceId: string | null = null;
  const client = createVoiceClient({
    apiKey: "secret-key",
    resourceId: "seed-tts-custom",
    fetch: asFetch(async (_input, init) => {
      capturedResourceId = new Headers(init?.headers).get("X-Api-Resource-Id");
      return new Response(new Uint8Array([9]), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      });
    }),
  });

  await client.createSpeech({
    req_params: {
      text: "hi",
      speaker: "voice-1",
      audio_params: { format: "mp3", sample_rate: 24000 },
    },
  });

  assert.equal(capturedResourceId, "seed-tts-custom");
});

test("decodes a JSON response with base64 audio data", async () => {
  const audioBytes = new Uint8Array([10, 20, 30]);
  const base64 = Buffer.from(audioBytes).toString("base64");
  const client = createVoiceClient({
    apiKey: "secret-key",
    fetch: asFetch(async () =>
      Response.json({ data: base64 }, { headers: { "Content-Type": "application/json" } }),
    ),
  });

  const result = await client.createSpeech({
    req_params: {
      text: "hi",
      speaker: "voice-1",
      audio_params: { format: "mp3", sample_rate: 24000 },
    },
  });

  assert.deepEqual(Array.from(result.audio), [10, 20, 30]);
});

test("throws VoiceResponseShapeError on an unrecognized JSON shape", async () => {
  const client = createVoiceClient({
    apiKey: "secret-key",
    fetch: asFetch(async () =>
      Response.json({ unexpected: true }, { headers: { "Content-Type": "application/json" } }),
    ),
  });

  await assert.rejects(
    client.createSpeech({
      req_params: {
        text: "hi",
        speaker: "voice-1",
        audio_params: { format: "mp3", sample_rate: 24000 },
      },
    }),
    VoiceResponseShapeError,
  );
});

test("throws VoiceResponseShapeError on a completely unexpected content type", async () => {
  const client = createVoiceClient({
    apiKey: "secret-key",
    fetch: asFetch(async () => new Response("<html></html>", { headers: { "Content-Type": "text/html" } })),
  });

  await assert.rejects(
    client.createSpeech({
      req_params: {
        text: "hi",
        speaker: "voice-1",
        audio_params: { format: "mp3", sample_rate: 24000 },
      },
    }),
    VoiceResponseShapeError,
  );
});

test("HTTP failures expose status and at most 1000 response characters", async () => {
  const responseBody = "x".repeat(1_500);
  const client = createVoiceClient({
    apiKey: "secret-key",
    fetch: asFetch(async () => new Response(responseBody, { status: 429 })),
  });

  await assert.rejects(
    client.createSpeech({
      req_params: {
        text: "hi",
        speaker: "voice-1",
        audio_params: { format: "mp3", sample_rate: 24000 },
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof VoiceHttpError);
      assert.equal(error.status, 429);
      assert.equal(error.responseBody, "x".repeat(1_000));
      return true;
    },
  );
});
