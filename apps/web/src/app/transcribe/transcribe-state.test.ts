import assert from "node:assert/strict";
import test from "node:test";

import {
  INITIAL_TRANSCRIBE_STATE,
  transcribeReducer,
  type TranscribeState,
} from "./transcribe-state.js";

test("starts idle with no file", () => {
  assert.equal(INITIAL_TRANSCRIBE_STATE.phase, "idle");
  assert.equal(INITIAL_TRANSCRIBE_STATE.fileName, null);
});

test("set file resets to idle and clears prior result", () => {
  const state: TranscribeState = {
    fileName: "old.mp3",
    phase: "complete",
    errorMessage: null,
    text: "old transcript",
  };
  const next = transcribeReducer(state, { type: "SET_FILE", fileName: "new.wav" });
  assert.equal(next.fileName, "new.wav");
  assert.equal(next.phase, "idle");
  assert.equal(next.text, null);
});

test("phase transitions through encoding, uploading, processing", () => {
  let state = transcribeReducer(INITIAL_TRANSCRIBE_STATE, { type: "START_ENCODING" });
  assert.equal(state.phase, "encoding");
  state = transcribeReducer(state, { type: "START_UPLOADING" });
  assert.equal(state.phase, "uploading");
  state = transcribeReducer(state, { type: "START_PROCESSING" });
  assert.equal(state.phase, "processing");
});

test("complete stores the transcript text", () => {
  const next = transcribeReducer(
    { ...INITIAL_TRANSCRIBE_STATE, phase: "processing" },
    { type: "COMPLETE", text: "hello world" },
  );
  assert.equal(next.phase, "complete");
  assert.equal(next.text, "hello world");
});

test("no_speech sets an empty transcript, not an error", () => {
  const next = transcribeReducer(
    { ...INITIAL_TRANSCRIBE_STATE, phase: "processing" },
    { type: "NO_SPEECH" },
  );
  assert.equal(next.phase, "no_speech");
  assert.equal(next.text, "");
  assert.equal(next.errorMessage, null);
});

test("error stores a message and moves to failed", () => {
  const next = transcribeReducer(
    { ...INITIAL_TRANSCRIBE_STATE, phase: "uploading" },
    { type: "ERROR", message: "Submission failed." },
  );
  assert.equal(next.phase, "failed");
  assert.equal(next.errorMessage, "Submission failed.");
});
