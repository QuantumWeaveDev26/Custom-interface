"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  INITIAL_STUDIO_STATE,
  studioReducer,
  type StudioAsset,
  type StudioMode,
} from "./studio-state";

export interface StudioClientProps {
  creditBalance: number;
  imageModelLabel: string;
  videoModelLabel: string;
}

interface JobStatusMessage {
  status: "queued" | "processing" | "complete" | "failed";
  errorMessage?: string;
  assets?: StudioAsset[];
}

const MODES: StudioMode[] = ["image", "video"];

export function StudioClient({
  creditBalance,
  imageModelLabel,
  videoModelLabel,
}: StudioClientProps) {
  const [state, dispatch] = useReducer(studioReducer, INITIAL_STUDIO_STATE);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const isBusy =
    state.phase === "submitting" ||
    state.phase === "queued" ||
    state.phase === "processing";

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isBusy || state.prompt.trim().length === 0) return;

      dispatch({ type: "SUBMIT_START" });

      let response: Response;
      try {
        response = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: state.mode, prompt: state.prompt }),
        });
      } catch {
        dispatch({ type: "SUBMIT_ERROR", message: "Could not reach the server." });
        return;
      }

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        dispatch({ type: "SUBMIT_ERROR", message: body.error ?? "Submission failed." });
        return;
      }

      const { jobId } = (await response.json()) as { jobId: string };
      dispatch({ type: "JOB_QUEUED", jobId });

      const source = new EventSource(`/api/jobs/${jobId}/stream`);
      eventSourceRef.current = source;

      source.onmessage = (message) => {
        let parsed: JobStatusMessage;
        try {
          parsed = JSON.parse(message.data as string) as JobStatusMessage;
        } catch {
          return;
        }
        if (parsed.status === "queued") return;
        dispatch({
          type: "STATUS_EVENT",
          status: parsed.status,
          ...(parsed.errorMessage === undefined ? {} : { errorMessage: parsed.errorMessage }),
          ...(parsed.assets === undefined ? {} : { assets: parsed.assets }),
        });
        if (parsed.status === "complete" || parsed.status === "failed") {
          source.close();
        }
      };

      source.onerror = () => {
        source.close();
      };
    },
    [isBusy, state.mode, state.prompt],
  );

  const modelLabel = state.mode === "image" ? imageModelLabel : videoModelLabel;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-bold">Studio</h1>
      <p className="mt-1 text-sm text-gray-600">Credit balance: {creditBalance}</p>

      <div className="mt-6 flex gap-2" role="radiogroup" aria-label="Generation mode">
        {MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={state.mode === mode}
            disabled={isBusy}
            onClick={() => dispatch({ type: "SET_MODE", mode })}
            className={`rounded px-4 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-black disabled:opacity-50 ${
              state.mode === mode ? "bg-black text-white" : "bg-gray-100 text-gray-800"
            }`}
          >
            {mode === "image" ? "Image" : "Video"}
          </button>
        ))}
      </div>

      <p className="mt-2 text-xs text-gray-500">Model: {modelLabel}</p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <label htmlFor="prompt" className="block text-sm font-medium text-gray-700">
          Prompt
        </label>
        <textarea
          id="prompt"
          value={state.prompt}
          onChange={(event) => dispatch({ type: "SET_PROMPT", prompt: event.target.value })}
          disabled={isBusy}
          rows={4}
          maxLength={2000}
          required
          placeholder="Describe what you want to create..."
          className="w-full rounded border border-gray-300 p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-black disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isBusy || state.prompt.trim().length === 0}
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-black disabled:opacity-50"
        >
          {isBusy ? "Working..." : "Generate"}
        </button>
      </form>

      <div className="mt-6" aria-live="polite">
        {state.phase === "queued" && <p className="text-sm text-gray-600">Queued...</p>}
        {state.phase === "processing" && (
          <p className="text-sm text-gray-600">Processing...</p>
        )}
        {state.phase === "failed" && (
          <p className="text-sm text-red-600">{state.errorMessage}</p>
        )}
        {state.phase === "complete" &&
          state.assets.map((asset) =>
            asset.type === "image" ? (
              <img
                key={asset.id}
                src={asset.url}
                alt="Generated result"
                className="mt-2 max-w-full rounded"
              />
            ) : (
              <video
                key={asset.id}
                src={asset.url}
                controls
                preload="metadata"
                className="mt-2 max-w-full rounded"
              />
            ),
          )}
      </div>
    </div>
  );
}
