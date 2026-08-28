import assert from "node:assert/strict";
import test from "node:test";

import { createVoiceClient } from "./client.js";
import { VoiceApiError, VoiceHttpError, VoiceResponseShapeError } from "./errors.js";

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

test("decodes createAudioGeneration's real-world response: application/json with the clip under \"audio\"", async () => {
  // Confirmed live 2026-08-28: tts/create is a genuinely different envelope from
  // tts/unidirectional -- real application/json (the header doesn't lie here), one
  // JSON object, with the base64 clip under "audio" instead of "data".
  const audioBytes = new Uint8Array([73, 68, 51]); // "ID3" -- real MP3 tag signature
  const base64 = Buffer.from(audioBytes).toString("base64");
  const client = createVoiceClient({
    apiKey: "secret-key",
    fetch: asFetch(async () =>
      Response.json({ audio: base64 }, { headers: { "Content-Type": "application/json; charset=utf-8" } }),
    ),
  });

  const result = await client.createAudioGeneration({
    model: "seed-audio-1.0",
    text_prompt: "A dramatic announcer voice",
    audio_config: { format: "mp3", sample_rate: 48000 },
  });

  assert.deepEqual(Array.from(result.audio), [73, 68, 51]);
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

test("decodes a real-world response: Content-Type text/plain with a JSON {code,message,data} body", async () => {
  // Confirmed live against the real API 2026-08-28: BytePlus Voice's Content-Type
  // header says text/plain even though the body is genuinely JSON. Must not trust
  // the header to decide whether to JSON-parse.
  const audioBytes = new Uint8Array([73, 68, 51]); // "ID3" -- real MP3 tag signature
  const base64 = Buffer.from(audioBytes).toString("base64");
  const client = createVoiceClient({
    apiKey: "secret-key",
    fetch: asFetch(async () =>
      new Response(JSON.stringify({ code: 0, message: "", data: base64 }), {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }),
    ),
  });

  const result = await client.createSpeech({
    req_params: {
      text: "hi",
      speaker: "voice-1",
      audio_params: { format: "mp3", sample_rate: 24000 },
    },
  });

  assert.deepEqual(Array.from(result.audio), [73, 68, 51]);
});

test("decodes a real NDJSON response: multiple audio-data lines plus benign end markers", async () => {
  // Confirmed live against the real API 2026-08-28 with a longer prompt: the body is
  // newline-delimited JSON -- a run of {code:0, data:"<base64>"} chunks to concatenate,
  // then a {code:0, data:null} marker, then a final {code:20000000, data:null} completion
  // marker. Neither marker line carries data and neither should throw.
  const chunk1 = Buffer.from([1, 2]).toString("base64");
  const chunk2 = Buffer.from([3, 4, 5]).toString("base64");
  const body = [
    JSON.stringify({ code: 0, message: "", data: chunk1 }),
    JSON.stringify({ code: 0, message: "", data: chunk2 }),
    JSON.stringify({ code: 0, message: "", data: null }),
    JSON.stringify({ code: 20_000_000, message: "OK", data: null }),
  ].join("\n");

  const client = createVoiceClient({
    apiKey: "secret-key",
    fetch: asFetch(async () =>
      new Response(body, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } }),
    ),
  });

  const result = await client.createSpeech({
    req_params: {
      text: "hi",
      speaker: "voice-1",
      audio_params: { format: "mp3", sample_rate: 24000 },
    },
  });

  assert.deepEqual(Array.from(result.audio), [1, 2, 3, 4, 5]);
});

test("throws VoiceApiError when the response envelope has a non-zero code", async () => {
  const client = createVoiceClient({
    apiKey: "secret-key",
    fetch: asFetch(async () =>
      new Response(JSON.stringify({ code: 3001, message: "invalid speaker" }), {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }),
    ),
  });

  await assert.rejects(
    client.createSpeech({
      req_params: {
        text: "hi",
        speaker: "not-a-real-speaker",
        audio_params: { format: "mp3", sample_rate: 24000 },
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof VoiceApiError);
      assert.equal(error.code, 3001);
      assert.equal(error.apiMessage, "invalid speaker");
      return true;
    },
  );
});

test("createAudioGeneration posts to tts/create with X-Api-Key and no resource header", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const client = createVoiceClient({
    apiKey: "secret-key",
    baseUrl: BASE_URL,
    fetch: asFetch(async (input, init) => {
      calls.push({ input: String(input), ...(init === undefined ? {} : { init }) });
      return new Response(new Uint8Array([5, 6, 7]), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      });
    }),
  });

  const request = {
    model: "seed-audio-1.0",
    text_prompt: "A dramatic announcer voice for a football stadium",
    audio_config: { format: "mp3" as const, sample_rate: 48000 },
  };

  const result = await client.createAudioGeneration(request);

  assert.deepEqual(Array.from(result.audio), [5, 6, 7]);
  assert.equal(calls[0]?.input, `${BASE_URL}/tts/create`);
  const headers = new Headers(calls[0]?.init?.headers);
  assert.equal(headers.get("X-Api-Key"), "secret-key");
  assert.equal(headers.has("X-Api-Resource-Id"), false);
  assert.equal(calls[0]?.init?.body, JSON.stringify(request));
});

test("cloneVoice posts to tts/voice_clone with a generated request ID", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const client = createVoiceClient({
    apiKey: "secret-key",
    baseUrl: BASE_URL,
    generateRequestId: () => "fixed-request-id",
    fetch: asFetch(async (input, init) => {
      calls.push({ input: String(input), ...(init === undefined ? {} : { init }) });
      return Response.json({ status: "ok" });
    }),
  });

  const request = {
    speaker_id: "my-voice",
    audio: { data: "base64data", format: "wav" as const },
    language: 1,
    extra_params: { demo_text: "hello" },
  };

  const result = await client.cloneVoice(request);

  assert.deepEqual(result, { status: "ok" });
  assert.equal(calls[0]?.input, `${BASE_URL}/tts/voice_clone`);
  const headers = new Headers(calls[0]?.init?.headers);
  assert.equal(headers.get("X-Api-Key"), "secret-key");
  assert.equal(headers.get("X-Api-Request-Id"), "fixed-request-id");
});

test("submitTranscription posts to auc/bigmodel/submit and returns the request ID", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const client = createVoiceClient({
    apiKey: "secret-key",
    baseUrl: BASE_URL,
    generateRequestId: () => "submit-id-123",
    fetch: asFetch(async (input, init) => {
      calls.push({ input: String(input), ...(init === undefined ? {} : { init }) });
      return Response.json({ acknowledged: true });
    }),
  });

  const request = {
    user: { uid: "demo" },
    audio: {
      url: "https://example.test/audio.mp3",
      language: "en-US",
      format: "wav",
      codec: "raw",
      rate: 16000,
      bits: 16,
      channel: 1,
    },
    request: { model_name: "bigmodel", show_utterances: true },
  };

  const result = await client.submitTranscription(request);

  assert.equal(result.requestId, "submit-id-123");
  assert.deepEqual(result.raw, { acknowledged: true });
  assert.equal(calls[0]?.input, `${BASE_URL}/auc/bigmodel/submit`);
  const headers = new Headers(calls[0]?.init?.headers);
  assert.equal(headers.get("x-api-key"), "secret-key");
  assert.equal(headers.get("X-Api-Resource-Id"), "volc.seedasr.auc");
  assert.equal(headers.get("X-Api-Request-Id"), "submit-id-123");
  assert.equal(headers.get("X-Api-Sequence"), "-1");
});

test("queryTranscription posts to auc/bigmodel/query reusing the same request ID", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const client = createVoiceClient({
    apiKey: "secret-key",
    baseUrl: BASE_URL,
    fetch: asFetch(async (input, init) => {
      calls.push({ input: String(input), ...(init === undefined ? {} : { init }) });
      return new Response(JSON.stringify({ audio_info: { duration: 3000 }, result: { text: "hello" } }), {
        status: 200,
        headers: { "x-api-status-code": "20000000", "x-api-message": "OK" },
      });
    }),
  });

  const result = await client.queryTranscription("submit-id-123");

  assert.deepEqual(result, { status: "complete", text: "hello" });
  assert.equal(calls[0]?.input, `${BASE_URL}/auc/bigmodel/query`);
  const headers = new Headers(calls[0]?.init?.headers);
  assert.equal(headers.get("X-Api-Request-Id"), "submit-id-123");
  assert.equal(calls[0]?.init?.body, "{}");
});

test("queryTranscription reports processing while status code is 20000001", async () => {
  // Confirmed live 2026-08-28: the real job status is only in the x-api-status-code
  // response header, not the JSON body -- the body stays {"audio_info":{},"result":{"text":""}}
  // while still processing.
  const client = createVoiceClient({
    apiKey: "secret-key",
    baseUrl: BASE_URL,
    fetch: asFetch(async () =>
      new Response(JSON.stringify({ audio_info: {}, result: { text: "" } }), {
        status: 200,
        headers: {
          "x-api-status-code": "20000001",
          "x-api-message": "[Processing in progress] Handle response: Start Processing",
        },
      }),
    ),
  });

  const result = await client.queryTranscription("submit-id-123");

  assert.deepEqual(result, { status: "processing", text: null });
});

test("queryTranscription reports no_speech while status code is 20000003", async () => {
  // Confirmed live: a synthetic non-speech audio clip terminates with this code rather
  // than an error -- it's a legitimate empty-transcript outcome, not a failure.
  const client = createVoiceClient({
    apiKey: "secret-key",
    baseUrl: BASE_URL,
    fetch: asFetch(async () =>
      new Response(JSON.stringify({ audio_info: { duration: 3000 }, result: { text: "" } }), {
        status: 200,
        headers: {
          "x-api-status-code": "20000003",
          "x-api-message": "[Normal silence audio] Handle response: no valid speech in audio",
        },
      }),
    ),
  });

  const result = await client.queryTranscription("submit-id-123");

  assert.deepEqual(result, { status: "no_speech", text: "" });
});

test("queryTranscription throws VoiceApiError for an unrecognized status code", async () => {
  const client = createVoiceClient({
    apiKey: "secret-key",
    baseUrl: BASE_URL,
    fetch: asFetch(async () =>
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "x-api-status-code": "45000001", "x-api-message": "invalid audio format" },
      }),
    ),
  });

  await assert.rejects(client.queryTranscription("submit-id-123"), (error: unknown) => {
    assert.ok(error instanceof VoiceApiError);
    assert.equal(error.code, 45_000_001);
    assert.equal(error.apiMessage, "invalid audio format");
    return true;
  });
});
