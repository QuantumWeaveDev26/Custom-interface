import assert from "node:assert/strict";
import test from "node:test";

import {
  INITIAL_VOICE_CLONE_STATE,
  voiceCloneReducer,
  type VoiceCloneState,
} from "./voice-clone-state.js";

test("starts idle with no file and no consent", () => {
  assert.equal(INITIAL_VOICE_CLONE_STATE.phase, "idle");
  assert.equal(INITIAL_VOICE_CLONE_STATE.fileName, null);
  assert.equal(INITIAL_VOICE_CLONE_STATE.consent, false);
});

test("set consent updates only the consent field", () => {
  const next = voiceCloneReducer(INITIAL_VOICE_CLONE_STATE, {
    type: "SET_CONSENT",
    consent: true,
  });
  assert.equal(next.consent, true);
  assert.equal(next.phase, "idle");
});

test("set file preserves consent already given", () => {
  const state: VoiceCloneState = { ...INITIAL_VOICE_CLONE_STATE, consent: true };
  const next = voiceCloneReducer(state, { type: "SET_FILE", fileName: "voice.mp3" });
  assert.equal(next.fileName, "voice.mp3");
  assert.equal(next.consent, true);
});

test("phase transitions through encoding and uploading", () => {
  let state = voiceCloneReducer(INITIAL_VOICE_CLONE_STATE, { type: "START_ENCODING" });
  assert.equal(state.phase, "encoding");
  state = voiceCloneReducer(state, { type: "START_UPLOADING" });
  assert.equal(state.phase, "uploading");
});

test("complete stores the speaker ID, training status, and demo audio URL", () => {
  const next = voiceCloneReducer(
    { ...INITIAL_VOICE_CLONE_STATE, phase: "uploading" },
    {
      type: "COMPLETE",
      speakerId: "S_abc123",
      trainingStatus: 2,
      demoAudioUrl: "https://x.bytespeech.com/S_abc123",
    },
  );
  assert.equal(next.phase, "complete");
  assert.equal(next.speakerId, "S_abc123");
  assert.equal(next.trainingStatus, 2);
  assert.equal(next.demoAudioUrl, "https://x.bytespeech.com/S_abc123");
});

test("error stores a message and moves to failed", () => {
  const next = voiceCloneReducer(
    { ...INITIAL_VOICE_CLONE_STATE, phase: "uploading" },
    { type: "ERROR", message: "Cloning failed." },
  );
  assert.equal(next.phase, "failed");
  assert.equal(next.errorMessage, "Cloning failed.");
});
