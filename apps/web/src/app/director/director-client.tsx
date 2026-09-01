"use client";

import Link from "next/link";

import type { LookPresetId } from "@creative-ai/prompt-library";

import { AttachButton, type Attachment } from "../attach-button";
import { EmptyState } from "../empty-state";
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

export interface FilmLimits {
  minDurationSeconds: number;
  maxDurationSeconds: number;
  maxShots: number;
}

export function DirectorClient({
  characters,
  filmLimits,
  creditsPerSecond,
}: {
  characters: readonly { id: string; name: string; assetIds: string[] }[];
  filmLimits: FilmLimits;
  creditsPerSecond: number;
}) {
  /**
   * One cast character for the whole plan, for the same reason the look is
   * chosen per plan: a character who changes face between shots is not a
   * character. Null means an uncast film, which is the default.
   */
  const [castId, setCastId] = useState<string | null>(null);
  // References attached straight from the prompt box, for the common case of
  // "use this photo" where the user has not saved a character and should not
  // have to first.
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [state, dispatch] = useReducer(directorReducer, INITIAL_DIRECTOR_STATE);
  const [generation, setGeneration] = useState<Record<number, ShotGenerationState>>({});
  const [filming, setFilming] = useState(false);
  const [filmJobId, setFilmJobId] = useState<string | null>(null);
  const [filmError, setFilmError] = useState<string | null>(null);
  const eventSources = useRef<Record<number, EventSource>>({});

  useEffect(() => {
    return () => {
      for (const source of Object.values(eventSources.current)) {
        source.close();
      }
    };
  }, []);

  // Cast and attachments are additive: a saved identity plus a one-off
  // reference is a reasonable thing to ask for. Shared by a single shot and by
  // the whole film, so both carry the same people.
  const referenceIdsForCast = () => [
    ...(characters.find((character) => character.id === castId)?.assetIds ?? []),
    ...attachments.map((attachment) => attachment.assetId),
  ];

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

      const { shots, lookLabel, lookPreset } = (await response.json()) as {
        shots: DirectorShot[];
        lookLabel: string;
        lookPreset: LookPresetId;
      };
      dispatch({ type: "PLAN_SUCCESS", shots, lookLabel, lookPreset });
    },
    [state.brief, state.phase],
  );

  /**
   * Films the whole plan as one continuous piece.
   *
   * The shots are already a shot list, and a chain already takes one — this is
   * the join between them. Each clip extends the one before it, so what comes
   * back is a single cut rather than N unrelated clips the user has to
   * assemble.
   *
   * Durations are clamped to what the model will actually make. A plan happily
   * asks for a three-second insert and the model's floor is four; clamping is
   * the only way to film it, and the button says so rather than letting the
   * server reject the job at submission.
   */
  const filmable = state.shots.slice(0, filmLimits.maxShots);
  const filmDurations = filmable.map((shot) =>
    Math.min(
      filmLimits.maxDurationSeconds,
      Math.max(filmLimits.minDurationSeconds, shot.durationSeconds),
    ),
  );
  const filmSeconds = filmDurations.reduce((total, each) => total + each, 0);
  const clamped = filmable.filter(
    (shot, index) => shot.durationSeconds !== filmDurations[index],
  ).length;

  const filmPlan = useCallback(async () => {
    setFilmError(null);
    setFilming(true);
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "video",
          prompt: state.brief,
          params: {
            resolution: "720p",
            // An extension takes its shape from the clip before it, so only the
            // opening shot's ratio is ours to choose.
            ratio: "21:9",
            durationSeconds: filmDurations[0] ?? filmLimits.minDurationSeconds,
            withAudio: true,
            rounds: filmable.length,
            shotPrompts: filmable.map((shot) => shot.prompt),
            shotDurations: filmDurations,
          },
          ...(referenceIdsForCast().length === 0
            ? {}
            : {
                inputAssets: referenceIdsForCast().map((assetId) => ({
                  assetId,
                  role: "reference",
                })),
              }),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setFilmError(body.error ?? "Could not start the film.");
        return;
      }
      const { jobId } = (await response.json()) as { jobId: string };
      setFilmJobId(jobId);
    } catch {
      setFilmError("Could not reach the server.");
    } finally {
      setFilming(false);
    }
  }, [state.brief, filmable, filmDurations, filmLimits.minDurationSeconds]);

  const generateShot = useCallback((index: number, shot: DirectorShot) => {
    const referenceIds = referenceIdsForCast();
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
          body: JSON.stringify({
            type: "video",
            prompt: shot.prompt,
            ...(referenceIds.length === 0
              ? {}
              : {
                  inputAssets: referenceIds.map((assetId) => ({
                    assetId,
                    role: "reference",
                  })),
                }),
          }),
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
  }, [characters, castId, attachments]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold tracking-tight">Director</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Describe a scene in one line; the director agent breaks it into a shot list.
      </p>

      {/* Same panel as Studio's composer: the brief is this page's prompt, and
          the two tools should not look like different products. */}
      {/* The same composer as Studio: one panel, the brief and the action that
          spends credits together. The label is gone because the placeholder
          already says what to type and the panel is the only input on screen. */}
      <form onSubmit={handlePlan} className="composer panel mt-5 space-y-3 p-4">
        <label htmlFor="brief" className="sr-only">
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
        />

        <div className="composer-footer">
          <AttachButton
            attachments={attachments}
            disabled={state.phase === "planning"}
            accept="images"
            hint="Every shot in this plan is generated with these references."
            onAttached={(attachment) =>
              setAttachments((previous) => [...previous, attachment])
            }
            onRemove={(assetId) =>
              setAttachments((previous) =>
                previous.filter((item) => item.assetId !== assetId),
              )
            }
          />

          <button
            type="submit"
            disabled={state.phase === "planning" || state.brief.trim().length === 0}
            className="btn-primary gap-2"
          >
            {state.phase === "planning" && <span className="spinner" aria-hidden="true" />}
            {state.phase === "planning" ? "Planning..." : "Plan Shots"}
          </button>
        </div>
      </form>

      {characters.length > 0 && (
        <div className="mt-4">
          <p className="rule-cap mb-2">
            Cast <span className="normal-case tracking-normal">(optional)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {characters.map((character) => {
              const active = castId === character.id;
              return (
                <button
                  key={character.id}
                  type="button"
                  aria-pressed={active}
                  // Clicking the cast character again clears it, so an uncast
                  // film stays reachable without a separate "none" control.
                  onClick={() => setCastId(active ? null : character.id)}
                  className="opt"
                  data-active={active}
                >
                  {character.name}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
            {castId === null
              ? "Pick someone to keep the same face across every shot."
              : "Every shot in this plan is generated with that character."}
          </p>
        </div>
      )}

      {/* Planning and failure are announced: a screen-reader user pressing
          "Plan Shots" otherwise gets silence until they hunt for the result. */}
      <div aria-live="polite" className="sr-only">
        {state.phase === "planning" && "Planning shots"}
        {state.phase === "planned" && `${state.shots.length} shots planned`}
        {state.phase === "failed" && `Planning failed. ${state.errorMessage ?? ""}`}
      </div>

      {state.phase === "idle" && (
        <EmptyState
          title="No shot list yet"
          description="Describe a scene in one line. The Director breaks it into shots, picks a camera move and lens for each, and grades them all alike."
          example="A street food vendor at night in Bangkok"
          onUseExample={(brief) => dispatch({ type: "SET_BRIEF", brief })}
        />
      )}

      {state.phase === "failed" && (
        <div className="card border-[var(--danger)]/30 mt-4 p-4">
          <p className="text-sm text-[var(--danger)]">{state.errorMessage}</p>
        </div>
      )}

      {/* Filming the plan is the point of planning it. One continuous piece,
          each clip extending the last, rather than N clips the user stitches
          themselves. It sits above the shot list because it acts on all of
          them, and the per-shot buttons remain for anyone who only wants one. */}
      {state.phase === "planned" && filmable.length > 1 && (
        <div className="panel mt-6 p-4">
          <div className="composer-footer">
            <div>
              <p className="text-sm text-[var(--text)]">
                Film all {filmable.length} shots as one continuous piece
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                {filmSeconds}s in total. Each clip continues the one before it,
                and they cannot run in parallel — expect minutes per clip.
                {clamped > 0 &&
                  ` ${clamped} shot${clamped === 1 ? "" : "s"} shorter than ${filmLimits.minDurationSeconds}s will be filmed at ${filmLimits.minDurationSeconds}s, the model's floor.`}
                {state.shots.length > filmLimits.maxShots &&
                  ` Only the first ${filmLimits.maxShots} shots are filmed — that is the chain limit.`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void filmPlan()}
              disabled={filming || filmJobId !== null}
              className="btn-primary gap-2.5"
            >
              {filming && <span className="spinner" aria-hidden="true" />}
              <span>{filmJobId === null ? "Film the plan" : "Filming"}</span>
              <span className="val text-[11px] opacity-70">
                {filmSeconds * creditsPerSecond} cr
              </span>
            </button>
          </div>

          {filmError !== null && (
            <p className="mt-2 text-xs text-[var(--danger)]">{filmError}</p>
          )}
          {filmJobId !== null && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Filming started. It runs in the background — the finished piece and
              its clips appear in the{" "}
              <Link href="/gallery" className="underline">
                Gallery
              </Link>{" "}
              when it is done.
            </p>
          )}
        </div>
      )}

      {state.phase === "planned" && state.lookLabel !== null && (
        <p className="rule-cap mt-8">
          Graded as <span className="text-[var(--text)]">{state.lookLabel}</span> across
          every shot
        </p>
      )}

      {state.phase === "planned" && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {state.shots.map((shot, index) => {
            const shotGeneration = generation[index] ?? IDLE_GENERATION;
            const busy =
              shotGeneration.phase === "submitting" ||
              shotGeneration.phase === "queued" ||
              shotGeneration.phase === "processing";

            return (
              <div key={index} className="card overflow-hidden">
                {/* The finished shot sits flush at the top of the card, the
                    way an asset fills a gallery tile. Inset in the padding
                    below the text, it read as an attachment to the plan
                    rather than as the thing the plan was for. */}
                {shotGeneration.phase === "complete" && shotGeneration.assetUrl && (
                  <video
                    src={shotGeneration.assetUrl}
                    controls
                    preload="metadata"
                    className="w-full"
                  />
                )}

                <div className="p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="val font-mono text-[11px] text-[var(--text-faint)]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="text-xs text-[var(--text-faint)]">
                      {shot.cameraLabel} &middot; {shot.lensLabel} &middot;{" "}
                      {shot.durationSeconds}s
                    </span>
                  </div>
                  {/* The shot is editable in place. A plan you cannot change is
                      a suggestion you have to accept, and the model's fourth
                      shot is rarely the one you wanted. Rewriting recomposes
                      the prompt with this shot's own camera and lens and the
                      film's grade, so what changes here is what gets made. */}
                  <label htmlFor={`shot-${index}`} className="sr-only">
                    Shot {index + 1} description
                  </label>
                  <textarea
                    id={`shot-${index}`}
                    value={shot.description}
                    disabled={busy}
                    rows={4}
                    maxLength={1000}
                    onChange={(event) =>
                      dispatch({
                        type: "EDIT_SHOT",
                        index,
                        description: event.target.value,
                      })
                    }
                    className="input-field mt-2.5 resize-none !py-2 text-sm"
                  />

                  {/* Carries the signal because it spends credits, which is the
                      one thing DESIGN.md reserves the signal for. As a
                      secondary it was indistinguishable from Clear. */}
                  <button
                    type="button"
                    onClick={() => generateShot(index, shot)}
                    title={shot.prompt}
                    disabled={busy}
                    className="btn-primary mt-4 w-full gap-2 !py-2 text-xs"
                  >
                    {busy && <span className="spinner h-3 w-3" aria-hidden="true" />}
                    {busy
                      ? "Working..."
                      : shotGeneration.phase === "complete"
                        ? "Shoot it again"
                        : "Generate this shot"}
                  </button>

                  {(shotGeneration.phase === "queued" ||
                    shotGeneration.phase === "processing") && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                      <span
                        className="spinner h-3 w-3 text-[var(--text-muted)]"
                        aria-hidden="true"
                      />
                      {shotGeneration.phase === "queued" ? "Queued..." : "Rendering..."}
                    </p>
                  )}
                  {shotGeneration.phase === "failed" && (
                    <p className="mt-2 text-xs text-[var(--danger)]">
                      {shotGeneration.errorMessage}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
