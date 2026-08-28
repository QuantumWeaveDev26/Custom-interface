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
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Director</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Describe a scene in one line; the director agent breaks it into a shot list.
      </p>

      <form onSubmit={handlePlan} className="mt-6 space-y-3">
        <label htmlFor="brief" className="block text-xs font-medium text-[var(--text-muted)]">
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
          className="input-field resize-none"
        />
        <button
          type="submit"
          disabled={state.phase === "planning" || state.brief.trim().length === 0}
          className="btn-primary gap-2"
        >
          {state.phase === "planning" && <span className="spinner" aria-hidden="true" />}
          {state.phase === "planning" ? "Planning..." : "Plan Shots"}
        </button>
      </form>

      {state.phase === "failed" && (
        <div className="card border-[var(--danger)]/30 mt-4 p-4">
          <p className="text-sm text-[var(--danger)]">{state.errorMessage}</p>
        </div>
      )}

      {state.phase === "planned" && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {state.shots.map((shot, index) => {
            const shotGeneration = generation[index] ?? IDLE_GENERATION;
            const busy =
              shotGeneration.phase === "submitting" ||
              shotGeneration.phase === "queued" ||
              shotGeneration.phase === "processing";

            return (
              <div key={index} className="card p-4">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-[var(--surface-hover)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Shot {index + 1}
                  </span>
                  <span className="text-xs text-[var(--text-faint)]">
                    {shot.cameraLabel} &middot; {shot.durationSeconds}s
                  </span>
                </div>
                <p className="mt-3 text-sm text-[var(--text)]">{shot.description}</p>

                <button
                  type="button"
                  onClick={() => generateShot(index, shot)}
                  disabled={busy}
                  className="btn-secondary mt-4 w-full gap-2 !py-2 text-xs"
                >
                  {busy && <span className="spinner h-3 w-3" aria-hidden="true" />}
                  {busy ? "Working..." : "Generate This Shot"}
                </button>

                {(shotGeneration.phase === "queued" || shotGeneration.phase === "processing") && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                    <span className="spinner h-3 w-3 text-[var(--accent-via)]" aria-hidden="true" />
                    {shotGeneration.phase === "queued" ? "Queued..." : "Rendering..."}
                  </p>
                )}
                {shotGeneration.phase === "failed" && (
                  <p className="mt-2 text-xs text-[var(--danger)]">{shotGeneration.errorMessage}</p>
                )}
                {shotGeneration.phase === "complete" && shotGeneration.assetUrl && (
                  <video
                    src={shotGeneration.assetUrl}
                    controls
                    preload="metadata"
                    className="mt-3 w-full rounded-lg"
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
