import assert from "node:assert/strict";
import test from "node:test";

import type { CloneVoiceRequest } from "@creative-ai/voice-client";

import {
  cloneVoiceFromAudio,
  type VoiceCloneDependencies,
} from "./voice-clone.js";

function harness() {
  const requests: CloneVoiceRequest[] = [];
  const dependencies: VoiceCloneDependencies = {
    cloneVoice: async (params) => {
      requests.push(params);
      return {
        speakerId: "S_assigned_by_provider",
        status: 2,
        availableTrainingTimes: 19,
        demoAudioUrl: "https://provider.example/demo.mp3",
      };
    },
  };
  return { dependencies, requests };
}

test("speaker_id is sent empty, because it is assigned by the provider", async () => {
  const bench = harness();

  await cloneVoiceFromAudio(Uint8Array.from([1, 2, 3]), bench.dependencies);

  // This is a regression guard on a bug that cost real debugging time: an
  // earlier version invented a speaker_id and sent it, which the provider
  // rejected with "resource ID is mismatched with speaker related resource".
  // speaker_id only ever accepts one that already exists — it is not a name
  // the caller gets to choose up front.
  assert.equal(bench.requests[0]?.speaker_id, "");
});

test("audio is sent as base64 wav", async () => {
  const bench = harness();

  await cloneVoiceFromAudio(Uint8Array.from([104, 105]), bench.dependencies);

  assert.equal(bench.requests[0]?.audio.format, "wav");
  assert.equal(
    Buffer.from(bench.requests[0]?.audio.data ?? "", "base64").toString(),
    "hi",
  );
});

test("the provider's assigned id is returned, not a local placeholder", async () => {
  const bench = harness();

  const outcome = await cloneVoiceFromAudio(Uint8Array.from([1]), bench.dependencies);

  assert.deepEqual(outcome, {
    speakerId: "S_assigned_by_provider",
    status: 2,
    demoAudioUrl: "https://provider.example/demo.mp3",
  });
});

test("a provider failure surfaces rather than returning an empty speaker", async () => {
  // Swallowing this would hand the user a voice ID that identifies nothing.
  const dependencies: VoiceCloneDependencies = {
    cloneVoice: async () => {
      throw new Error("55000000 resource ID is mismatched");
    },
  };

  await assert.rejects(
    cloneVoiceFromAudio(Uint8Array.from([1]), dependencies),
    /55000000/,
  );
});
