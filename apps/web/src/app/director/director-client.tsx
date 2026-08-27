"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  directorReducer,
  INITIAL_DIRECTOR_STATE,
  type DirectorShot,
} from "./director-state";

interface ShotGenerationState {
  phase: "idle" | "submitting" | "queued" | "processing" | "complete" | "failed";
  errorMessage: string | null;
  assetUrl: string | null;
}

const IDLE_GENERATION: ShotGenerationState = {
  phase: "idle",
  errorMessage: null,
  assetUrl: null,
};

interface JobStatusMessage {
  status: "queued" | "processing" | "complete" | "failed";
  errorMessage?: string;
  assets?: { id: string; type: "image" | "video"; url: string }[];
}

export function DirectorClient() {
  const [state, dispatch] = useReducer(directorReducer, INITIAL_DIRECTOR_STATE);
  const [generation, setGeneration] = useState<Record<number, ShotGenerationState>>({});
  const eventSources = useRef<Record<number, EventSource>>({});

  useEffect(() => {
    return () => {
      for (const source of Object.values(eventSources.current)) {
        source.close();
      }
    };
  }, []);

  const handlePlan = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (state.phase === "planning" || state.brief.trim().length === 0) return;

      dispatch({ type: "PLAN_START" });
      setGeneration({});

      let response: Response;
      try {
        response = await fetch("/api/director", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brief: state.brief }),
        });
      } catch {
        dispatch({ type: "PLAN_ERROR", message: "Could not reach the server." });
        return;
      }

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        dispatch({ type: "PLAN_ERROR", message: body.error ?? "Planning failed." });
        return;
      }

      const { shots } = (await response.json()) as { shots: DirectorShot[] };
      dispatch({ type: "PLAN_SUCCESS", shots });
    },
    [state.brief, state.phase],
  );

  const generateShot = useCallback((index: number, shot: DirectorShot) => {
    setGeneration((prev) => ({
      ...prev,
      [index]: { phase: "submitting", errorMessage: null, assetUrl: null },
    }));

    void (async () => {
      let response: Response;
      try {
        response = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "video", prompt: shot.prompt }),
        });
      } catch {
        setGeneration((prev) => ({
          ...prev,
          [index]: { phase: "failed", errorMessage: "Could not reach the server.", assetUrl: null },
        }));
        return;
      }

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setGeneration((prev) => ({
          ...prev,
          [index]: {
            phase: "failed",
            errorMessage: body.error ?? "Submission failed.",
            assetUrl: null,
          },
        }));
        return;
      }

      const { jobId } = (await response.json()) as { jobId: string };
      setGeneration((prev) => ({
        ...prev,
        [index]: { phase: "queued", errorMessage: null, assetUrl: null },
      }));

      const source = new EventSource(`/api/jobs/${jobId}/stream`);
      eventSources.current[index] = source;

      source.onmessage = (message) => {
        let parsed: JobStatusMessage;
        try {
          parsed = JSON.parse(message.data as string) as JobStatusMessage;
        } catch {
          return;
        }
        if (parsed.status === "queued") return;

        setGeneration((prev) => ({
          ...prev,
          [index]: {
            phase: parsed.status,
            errorMessage: parsed.errorMessage ?? null,
            assetUrl: parsed.assets?.[0]?.url ?? null,
          },
        }));

        if (parsed.status === "complete" || parsed.status === "failed") {
          source.close();
        }
      };

      source.onerror = () => {
        source.close();
      };
    })();
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">Director</h1>
      <p className="mt-1 text-sm text-gray-600">
        Describe a scene in one line; the director agent breaks it into a shot list.
      </p>

      <form onSubmit={handlePlan} className="mt-6 space-y-3">
        <label htmlFor="brief" className="block text-sm font-medium text-gray-700">
          Creative brief
        </label>
        <textarea
          id="brief"
          value={state.brief}
          onChange={(event) => dispatch({ type: "SET_BRIEF", brief: event.target.value })}
          disabled={state.phase === "planning"}
          rows={3}
          maxLength={500}
          required
          placeholder="A lone traveler crosses a vast desert at sunset..."
          className="w-full rounded border border-gray-300 p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-black disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={state.phase === "planning" || state.brief.trim().length === 0}
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-black disabled:opacity-50"
        >
          {state.phase === "planning" ? "Planning..." : "Plan Shots"}
        </button>
      </form>

      {state.phase === "failed" && (
        <p className="mt-4 text-sm text-red-600">{state.errorMessage}</p>
      )}

      {state.phase === "planned" && (
        <div className="mt-8 space-y-4">
          {state.shots.map((shot, index) => {
            const shotGeneration = generation[index] ?? IDLE_GENERATION;
            const busy =
              shotGeneration.phase === "submitting" ||
              shotGeneration.phase === "queued" ||
              shotGeneration.phase === "processing";

            return (
              <div key={index} className="rounded border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Shot {index + 1}
                  </span>
                  <span className="text-xs text-gray-500">
                    {shot.cameraLabel} &middot; {shot.durationSeconds}s
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-900">{shot.description}</p>

                <button
                  type="button"
                  onClick={() => generateShot(index, shot)}
                  disabled={busy}
                  className="mt-3 rounded bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  {busy ? "Working..." : "Generate This Shot"}
                </button>

                {shotGeneration.phase === "queued" && (
                  <p className="mt-2 text-xs text-gray-600">Queued...</p>
                )}
                {shotGeneration.phase === "processing" && (
                  <p className="mt-2 text-xs text-gray-600">Processing...</p>
                )}
                {shotGeneration.phase === "failed" && (
                  <p className="mt-2 text-xs text-red-600">{shotGeneration.errorMessage}</p>
                )}
                {shotGeneration.phase === "complete" && shotGeneration.assetUrl && (
                  <video
                    src={shotGeneration.assetUrl}
                    controls
                    preload="metadata"
                    className="mt-2 max-w-full rounded"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
