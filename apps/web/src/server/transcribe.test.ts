import assert from "node:assert/strict";
import test from "node:test";

import type { SubmitTranscriptionRequest } from "@creative-ai/voice-client";

import {
  getTranscriptionStatus,
  submitTranscriptionForAudio,
  type TranscribeDependencies,
} from "./transcribe.js";

function harness() {
  const puts: { bucket: string; key: string; contentType: string; bytes: number }[] = [];
  const signed: { bucket: string; key: string; expires: number }[] = [];
  const submitted: SubmitTranscriptionRequest[] = [];
  let queried: string | null = null;

  const dependencies: TranscribeDependencies = {
    putObject: async (input) => {
      puts.push({
        bucket: input.bucket,
        key: input.key,
        contentType: input.contentType,
        bytes: input.body.length,
      });
      return {};
    },
    signUrl: (input) => {
      signed.push(input);
      return `https://signed.example/${input.key}`;
    },
    submitTranscription: async (params) => {
      submitted.push(params);
      return { requestId: "req-1" };
    },
    queryTranscription: async (requestId) => {
      queried = requestId;
      return { status: "complete", text: "hello", utterances: [] } as never;
    },
    bucket: "assets",
    newId: () => "fixed-uuid",
  };

  return { dependencies, puts, signed, submitted, queried: () => queried };
}

test("audio is stored under the user's own prefix", async () => {
  const bench = harness();

  await submitTranscriptionForAudio("user-1", Uint8Array.from([1, 2, 3]), bench.dependencies);

  // The key is built from the user id and a generated UUID only. Nothing the
  // caller supplies reaches it, so one user's audio cannot land under another's
  // prefix.
  assert.equal(bench.puts[0]?.key, "user-1/transcriptions/fixed-uuid.wav");
  assert.equal(bench.puts[0]?.bucket, "assets");
  assert.equal(bench.puts[0]?.contentType, "audio/wav");
  assert.equal(bench.puts[0]?.bytes, 3);
});

test("the provider receives a signed URL, never the private bucket location", async () => {
  const bench = harness();

  await submitTranscriptionForAudio("user-1", Uint8Array.from([1]), bench.dependencies);

  const serialized = JSON.stringify(bench.submitted[0]);
  assert.doesNotMatch(serialized, /tos:\/\//);
  assert.match(serialized, /https:\/\/signed\.example\//);
  assert.equal(bench.signed[0]?.expires, 300);
});

test("upload happens before the URL is signed and submitted", async () => {
  // Signing first would hand the provider a URL for an object that does not
  // exist yet, and the failure would surface as a provider error rather than a
  // storage one.
  const order: string[] = [];
  const bench = harness();
  const dependencies: TranscribeDependencies = {
    ...bench.dependencies,
    putObject: async (input) => {
      order.push("put");
      return bench.dependencies.putObject(input);
    },
    submitTranscription: async (params) => {
      order.push("submit");
      return bench.dependencies.submitTranscription(params);
    },
  };

  await submitTranscriptionForAudio("user-1", Uint8Array.from([1]), dependencies);

  assert.deepEqual(order, ["put", "submit"]);
});

test("the declared audio format matches what the client encodes", async () => {
  const bench = harness();

  await submitTranscriptionForAudio("user-1", Uint8Array.from([1]), bench.dependencies);

  // These are asserted, not probed: the browser encodes to exactly this before
  // uploading (app/transcribe/audio-encode.ts). If that encoder changes and
  // this does not, the provider transcribes noise instead of failing loudly.
  assert.deepEqual(bench.submitted[0]?.audio, {
    url: "https://signed.example/user-1/transcriptions/fixed-uuid.wav",
    language: "en-US",
    format: "wav",
    codec: "raw",
    rate: 16000,
    bits: 16,
    channel: 1,
  });
});

test("the returned request id is the provider's, not one we invented", async () => {
  const bench = harness();

  const result = await submitTranscriptionForAudio(
    "user-1",
    Uint8Array.from([1]),
    bench.dependencies,
  );

  assert.equal(result.requestId, "req-1");
});

test("status lookup passes the request id straight through", async () => {
  const bench = harness();

  await getTranscriptionStatus("req-42", bench.dependencies);

  assert.equal(bench.queried(), "req-42");
});
