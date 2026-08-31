"use client";

import { EmptyState } from "../empty-state";
import { useCallback, useReducer, useRef } from "react";
import {
  INITIAL_TRANSCRIBE_STATE,
  transcribeReducer,
} from "./transcribe-state";
import { AudioDecodeError, encodeToWav16kMono } from "@/lib/audio-encode";

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 60; // 90 seconds

interface TranscriptionStatusResponse {
  status: "processing" | "complete" | "no_speech";
  text: string | null;
}

async function pollUntilDone(requestId: string): Promise<TranscriptionStatusResponse> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const response = await fetch(`/api/transcribe/${requestId}`);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Transcription status request failed.");
    }
    const result = (await response.json()) as TranscriptionStatusResponse;
    if (result.status !== "processing") {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error("Transcription is taking longer than expected. Try again.");
}

export function TranscribeClient() {
  const [state, dispatch] = useReducer(transcribeReducer, INITIAL_TRANSCRIBE_STATE);
  const fileRef = useRef<File | null>(null);

  const isBusy =
    state.phase === "encoding" || state.phase === "uploading" || state.phase === "processing";

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    fileRef.current = file;
    dispatch({ type: "SET_FILE", fileName: file.name });
  }, []);

  const handleTranscribe = useCallback(async () => {
    const file = fileRef.current;
    if (!file || isBusy) return;

    dispatch({ type: "START_ENCODING" });

    let wavBlob: Blob;
    try {
      wavBlob = await encodeToWav16kMono(file);
    } catch (error) {
      const message = error instanceof AudioDecodeError ? error.message : "Could not process this audio file.";
      dispatch({ type: "ERROR", message });
      return;
    }

    dispatch({ type: "START_UPLOADING" });

    const formData = new FormData();
    formData.append("audio", wavBlob, "audio.wav");

    let submitResponse: Response;
    try {
      submitResponse = await fetch("/api/transcribe", { method: "POST", body: formData });
    } catch {
      dispatch({ type: "ERROR", message: "Could not reach the server." });
      return;
    }

    if (!submitResponse.ok) {
      const body = (await submitResponse.json().catch(() => ({}))) as { error?: string };
      dispatch({ type: "ERROR", message: body.error ?? "Submission failed." });
      return;
    }

    const { requestId } = (await submitResponse.json()) as { requestId: string };
    dispatch({ type: "START_PROCESSING" });

    try {
      const result = await pollUntilDone(requestId);
      if (result.status === "no_speech") {
        dispatch({ type: "NO_SPEECH" });
      } else {
        dispatch({ type: "COMPLETE", text: result.text ?? "" });
      }
    } catch (error) {
      dispatch({
        type: "ERROR",
        message: error instanceof Error ? error.message : "Transcription failed.",
      });
    }
  }, [isBusy]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Speech to Text</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Upload an audio file to get a transcript. Works with mp3, wav, m4a, and most other
        audio formats.
      </p>

      <div className="mt-6 space-y-3">
        <label
          htmlFor="audio-file"
          className="card flex cursor-pointer flex-col items-center justify-center gap-2 border-dashed px-6 py-10 text-center transition-colors hover:border-[var(--border-strong)]"
        >
          <span className="gradient-ring h-8 w-8 rounded-[18px]" aria-hidden="true" />
          <span className="text-sm font-medium text-[var(--text)]">
            {state.fileName ?? "Choose an audio file"}
          </span>
          <span className="text-xs text-[var(--text-faint)]">Up to ~5 minutes</span>
        </label>
        <input
          id="audio-file"
          type="file"
          accept="audio/*"
          onChange={handleFileChange}
          disabled={isBusy}
          className="sr-only"
        />

        <button
          type="button"
          onClick={handleTranscribe}
          disabled={isBusy || !state.fileName}
          className="btn-primary w-full gap-2"
        >
          {isBusy && <span className="spinner" aria-hidden="true" />}
          {state.phase === "encoding" && "Preparing audio..."}
          {state.phase === "uploading" && "Uploading..."}
          {state.phase === "processing" && "Transcribing..."}
          {!isBusy && "Transcribe"}
        </button>
      </div>

      <div className="mt-6" aria-live="polite">
        {state.phase === "idle" && (
          <EmptyState
            title="No transcript yet"
            description="Choose an audio file above. Speech is transcribed with timings; a recording with no speech in it says so rather than returning an empty result."
          />
        )}

        {state.phase === "failed" && (
          <div className="card border-[var(--danger)]/30 p-4">
            <p className="text-sm text-[var(--danger)]">{state.errorMessage}</p>
          </div>
        )}
        {state.phase === "no_speech" && (
          <div className="card p-4">
            <p className="text-sm text-[var(--text-muted)]">
              No speech was detected in this audio.
            </p>
          </div>
        )}
        {state.phase === "complete" && (
          <div className="card p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
              Transcript
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text)]">
              {state.text && state.text.length > 0 ? state.text : "(empty transcript)"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
