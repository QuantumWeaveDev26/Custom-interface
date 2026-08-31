"use client";

import { useCallback, useReducer, useRef } from "react";
import {
  INITIAL_VOICE_CLONE_STATE,
  voiceCloneReducer,
} from "./voice-clone-state";
import { AudioDecodeError, encodeToWav16kMono } from "@/lib/audio-encode";

// Per BytePlus docs, TTS can be invoked on a cloned voice once training status is 2 or 4.
const READY_TRAINING_STATUSES = new Set([2, 4]);

interface CloneVoiceResponse {
  speakerId: string;
  status: number;
  demoAudioUrl: string | null;
}

export function VoiceCloneClient() {
  const [state, dispatch] = useReducer(voiceCloneReducer, INITIAL_VOICE_CLONE_STATE);
  const fileRef = useRef<File | null>(null);

  const isBusy = state.phase === "encoding" || state.phase === "uploading";

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    fileRef.current = file;
    dispatch({ type: "SET_FILE", fileName: file.name });
  }, []);

  const handleClone = useCallback(async () => {
    const file = fileRef.current;
    if (!file || !state.consent || isBusy) return;

    dispatch({ type: "START_ENCODING" });

    let wavBlob: Blob;
    try {
      wavBlob = await encodeToWav16kMono(file);
    } catch (error) {
      const message =
        error instanceof AudioDecodeError ? error.message : "Could not process this audio file.";
      dispatch({ type: "ERROR", message });
      return;
    }

    dispatch({ type: "START_UPLOADING" });

    const formData = new FormData();
    formData.append("audio", wavBlob, "voice-sample.wav");
    formData.append("consent", "true");

    let response: Response;
    try {
      response = await fetch("/api/voice-clone", { method: "POST", body: formData });
    } catch {
      dispatch({ type: "ERROR", message: "Could not reach the server." });
      return;
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      dispatch({ type: "ERROR", message: body.error ?? "Cloning failed." });
      return;
    }

    const result = (await response.json()) as CloneVoiceResponse;
    dispatch({
      type: "COMPLETE",
      speakerId: result.speakerId,
      trainingStatus: result.status,
      demoAudioUrl: result.demoAudioUrl,
    });
  }, [isBusy, state.consent]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Voice Cloning</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Upload a voice sample to create a reusable AI voice clone.
      </p>

      <div className="card mt-6 border-[var(--danger)]/30 p-4">
        <label className="flex items-start gap-3 text-sm text-[var(--text)]">
          <input
            type="checkbox"
            checked={state.consent}
            onChange={(event) => dispatch({ type: "SET_CONSENT", consent: event.target.checked })}
            disabled={isBusy}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent-via)]"
          />
          <span>
            I confirm I own this voice, or have explicit permission from the person whose
            voice this is, to create an AI clone of it. I understand this clone may be
            usable to generate speech that sounds like this person.
          </span>
        </label>
      </div>

      <div className="mt-4 space-y-3">
        <label
          htmlFor="voice-sample"
          className={`card flex flex-col items-center justify-center gap-2 border-dashed px-6 py-10 text-center transition-colors ${
            state.consent ? "cursor-pointer hover:border-[var(--border-strong)]" : "cursor-not-allowed opacity-50"
          }`}
        >
          <span className="gradient-ring h-8 w-8 rounded-[18px]" aria-hidden="true" />
          <span className="text-sm font-medium text-[var(--text)]">
            {state.fileName ?? "Choose a voice sample"}
          </span>
          <span className="text-xs text-[var(--text-faint)]">
            A clear recording of one speaker, no background noise
          </span>
        </label>
        <input
          id="voice-sample"
          type="file"
          accept="audio/*"
          onChange={handleFileChange}
          disabled={isBusy || !state.consent}
          className="sr-only"
        />

        <button
          type="button"
          onClick={handleClone}
          disabled={isBusy || !state.consent || !state.fileName}
          className="btn-primary w-full gap-2"
        >
          {isBusy && <span className="spinner" aria-hidden="true" />}
          {state.phase === "encoding" && "Preparing audio..."}
          {state.phase === "uploading" && "Cloning voice..."}
          {!isBusy && "Clone Voice"}
        </button>
      </div>

      <div className="mt-6" aria-live="polite">
        {state.phase === "failed" && (
          <div className="card border-[var(--danger)]/30 p-4">
            <p className="text-sm text-[var(--danger)]">{state.errorMessage}</p>
          </div>
        )}
        {state.phase === "complete" && (
          <div className="card p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
              {state.trainingStatus !== null && READY_TRAINING_STATUSES.has(state.trainingStatus)
                ? "Voice cloned — ready to use"
                : "Voice cloned — training"}
            </p>
            <p className="rule-cap mt-3">
              Your voice ID
            </p>
            <p className="mt-1 font-mono text-sm text-[var(--text)]">{state.speakerId}</p>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Save this ID — it identifies your cloned voice for future generation.
            </p>
            {state.demoAudioUrl && (
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
                  Preview
                </p>
                <audio
                  src={state.demoAudioUrl}
                  controls
                  preload="metadata"
                  className="mt-2 w-full"
                />
                <p className="mt-1 text-[11px] text-[var(--text-faint)]">
                  This preview link expires in about an hour.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
