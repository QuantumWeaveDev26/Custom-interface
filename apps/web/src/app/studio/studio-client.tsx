"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import {
  IMAGE_SIZES,
  VIDEO_RATIOS,
  creditCostFor,
  type CreditPricing,
  type GenerationParams,
  type VideoResolution,
} from "@creative-ai/shared-types";
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
  voiceModelLabel: string;
  /** Only what the configured video model actually supports. */
  videoResolutions: readonly VideoResolution[];
  minDurationSeconds: number;
  maxDurationSeconds: number;
  pricing: CreditPricing;
  /** Recent images the user owns, offered as image-to-video first frames. */
  recentImageIds: readonly string[];
}

interface JobStatusMessage {
  status: "queued" | "processing" | "complete" | "failed";
  errorMessage?: string;
  assets?: StudioAsset[];
}

const MODES: StudioMode[] = ["image", "video", "voice"];
const MODE_LABELS: Record<StudioMode, string> = {
  image: "Image",
  video: "Video",
  voice: "Voice",
};

export function StudioClient({
  creditBalance,
  imageModelLabel,
  videoModelLabel,
  voiceModelLabel,
  videoResolutions,
  minDurationSeconds,
  maxDurationSeconds,
  pricing,
  recentImageIds,
}: StudioClientProps) {
  const [state, dispatch] = useReducer(studioReducer, INITIAL_STUDIO_STATE);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Built once here and reused for both the cost preview and the request body,
  // so the price shown can never drift from the price submitted.
  const params: GenerationParams = useMemo(() => {
    if (state.mode === "image") return { type: "image", size: state.imageSize };
    if (state.mode === "voice") return { type: "voice", style: state.voiceStyle };
    return {
      type: "video",
      resolution: state.resolution,
      ratio: state.ratio,
      durationSeconds: state.durationSeconds,
    };
  }, [
    state.mode,
    state.imageSize,
    state.voiceStyle,
    state.resolution,
    state.ratio,
    state.durationSeconds,
  ]);

  // Same function the server charges with — a preview, still authoritative
  // server-side.
  const estimatedCost = useMemo(
    () => creditCostFor(params, pricing),
    [params, pricing],
  );
  const affordable = estimatedCost <= creditBalance;

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
          body: JSON.stringify({
            type: state.mode,
            prompt: state.prompt,
            // `type` is the request discriminator, not a params field.
            params: (({ type: _ignored, ...rest }) => rest)(params),
            ...(state.mode === "video" && state.firstFrameAssetId !== null
              ? {
                  inputAssets: [
                    { assetId: state.firstFrameAssetId, role: "first_frame" },
                  ],
                }
              : {}),
          }),
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
    [isBusy, state.mode, state.prompt, params, state.firstFrameAssetId],
  );

  const modelLabel =
    state.mode === "image"
      ? imageModelLabel
      : state.mode === "video"
        ? videoModelLabel
        : voiceModelLabel;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Studio</h1>
        <span className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)]">
          <span className="gradient-ring h-2 w-2 rounded-full" aria-hidden="true" />
          {creditBalance} credits
        </span>
      </div>

      <div className="mt-6 card p-1.5">
        <div className="flex gap-1" role="radiogroup" aria-label="Generation mode">
          {MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={state.mode === mode}
              disabled={isBusy}
              data-active={state.mode === mode}
              onClick={() => dispatch({ type: "SET_MODE", mode })}
              className="pill flex-1"
            >
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 text-xs text-[var(--text-faint)]">Model: {modelLabel}</p>

      {state.mode === "voice" && (
        <div className="mt-3 flex gap-2" role="radiogroup" aria-label="Voice style">
          {(["standard", "expressive"] as const).map((style) => (
            <button
              key={style}
              type="button"
              role="radio"
              aria-checked={state.voiceStyle === style}
              disabled={isBusy}
              data-active={state.voiceStyle === style}
              onClick={() => dispatch({ type: "SET_VOICE_STYLE", voiceStyle: style })}
              className="pill !px-3 !py-1.5 text-xs"
              style={
                state.voiceStyle !== style
                  ? { background: "var(--surface)", border: "1px solid var(--border)" }
                  : undefined
              }
            >
              {style === "standard" ? "Standard" : "Expressive"}
            </button>
          ))}
        </div>
      )}

      {state.mode === "image" && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
            Size
          </p>
          <div className="flex gap-2" role="radiogroup" aria-label="Image size">
            {IMAGE_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                role="radio"
                aria-checked={state.imageSize === size}
                disabled={isBusy}
                data-active={state.imageSize === size}
                onClick={() => dispatch({ type: "SET_IMAGE_SIZE", imageSize: size })}
                className="pill !px-3 !py-1.5 text-xs"
                style={
                  state.imageSize !== size
                    ? { background: "var(--surface)", border: "1px solid var(--border)" }
                    : undefined
                }
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      )}

      {state.mode === "video" && recentImageIds.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
            Animate an image <span className="normal-case tracking-normal">(optional)</span>
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {recentImageIds.map((assetId) => {
              const selected = state.firstFrameAssetId === assetId;
              return (
                <button
                  key={assetId}
                  type="button"
                  disabled={isBusy}
                  aria-pressed={selected}
                  aria-label={selected ? "Deselect first frame" : "Use as first frame"}
                  // Clicking the selected image clears it, so text-to-video is
                  // always reachable without a separate "none" control.
                  onClick={() =>
                    dispatch({
                      type: "SET_FIRST_FRAME",
                      assetId: selected ? null : assetId,
                    })
                  }
                  className="shrink-0 overflow-hidden rounded-lg transition-all disabled:opacity-50"
                  style={{
                    border: selected
                      ? "2px solid var(--accent-via)"
                      : "2px solid var(--border)",
                  }}
                >
                  <img
                    src={`/api/assets/${assetId}`}
                    alt=""
                    className="h-16 w-16 object-cover"
                  />
                </button>
              );
            })}
          </div>
          {state.firstFrameAssetId !== null && (
            <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
              This image becomes the first frame. Your prompt describes the motion.
            </p>
          )}
        </div>
      )}

      {state.mode === "video" && (
        <div className="mt-3 space-y-3">
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
              Resolution
            </p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Resolution">
              {videoResolutions.map((resolution) => (
                <button
                  key={resolution}
                  type="button"
                  role="radio"
                  aria-checked={state.resolution === resolution}
                  disabled={isBusy}
                  data-active={state.resolution === resolution}
                  onClick={() => dispatch({ type: "SET_RESOLUTION", resolution })}
                  className="pill !px-3 !py-1.5 text-xs"
                  style={
                    state.resolution !== resolution
                      ? { background: "var(--surface)", border: "1px solid var(--border)" }
                      : undefined
                  }
                >
                  {resolution}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
              Aspect ratio
            </p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Aspect ratio">
              {VIDEO_RATIOS.map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  role="radio"
                  aria-checked={state.ratio === ratio}
                  disabled={isBusy}
                  data-active={state.ratio === ratio}
                  onClick={() => dispatch({ type: "SET_RATIO", ratio })}
                  className="pill !px-3 !py-1.5 text-xs"
                  style={
                    state.ratio !== ratio
                      ? { background: "var(--surface)", border: "1px solid var(--border)" }
                      : undefined
                  }
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="duration"
              className="mb-1.5 flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]"
            >
              <span>Duration</span>
              <span className="text-[var(--text)]">{state.durationSeconds}s</span>
            </label>
            <input
              id="duration"
              type="range"
              min={minDurationSeconds}
              max={maxDurationSeconds}
              step={1}
              value={state.durationSeconds}
              disabled={isBusy}
              onChange={(event) =>
                dispatch({
                  type: "SET_DURATION",
                  durationSeconds: Number(event.target.value),
                })
              }
              className="w-full accent-[var(--accent-via)] disabled:opacity-50"
            />
            <div className="flex justify-between text-[10px] text-[var(--text-faint)]">
              <span>{minDurationSeconds}s</span>
              <span>{maxDurationSeconds}s</span>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-3">
        <label htmlFor="prompt" className="block text-xs font-medium text-[var(--text-muted)]">
          {state.mode === "voice" ? "Text to speak" : "Prompt"}
        </label>
        <textarea
          id="prompt"
          value={state.prompt}
          onChange={(event) => dispatch({ type: "SET_PROMPT", prompt: event.target.value })}
          disabled={isBusy}
          rows={4}
          maxLength={2000}
          required
          placeholder={
            state.mode === "voice"
              ? state.voiceStyle === "expressive"
                ? "Describe the scene, tone, and words to speak (e.g. \"A dramatic announcer voice: Welcome to the show!\")..."
                : "Type the words you want spoken aloud..."
              : "Describe what you want to create..."
          }
          className="input-field resize-none"
        />
        <button
          type="submit"
          disabled={isBusy || state.prompt.trim().length === 0 || !affordable}
          className="btn-primary w-full gap-2"
        >
          {isBusy && <span className="spinner" aria-hidden="true" />}
          {isBusy
            ? "Working..."
            : `Generate · ${estimatedCost} credit${estimatedCost === 1 ? "" : "s"}`}
        </button>
        {!affordable && !isBusy && (
          <p className="text-xs text-[var(--danger)]">
            Not enough credits — this costs {estimatedCost}, you have {creditBalance}.
          </p>
        )}
      </form>

      <div className="mt-6" aria-live="polite">
        {(state.phase === "queued" || state.phase === "processing") && (
          <div className="card flex items-center gap-3 p-4">
            <span className="spinner text-[var(--accent-via)]" aria-hidden="true" />
            <p className="text-sm text-[var(--text-muted)]">
              {state.phase === "queued" ? "Queued..." : "Generating..."}
            </p>
          </div>
        )}
        {state.phase === "failed" && (
          <div className="card border-[var(--danger)]/30 p-4">
            <p className="text-sm text-[var(--danger)]">{state.errorMessage}</p>
          </div>
        )}
        {state.phase === "complete" &&
          state.assets.map((asset) => {
            if (asset.type === "image") {
              return (
                <img
                  key={asset.id}
                  src={asset.url}
                  alt="Generated result"
                  className="card w-full object-cover"
                />
              );
            }
            if (asset.type === "audio") {
              return (
                <div key={asset.id} className="card p-4">
                  <audio src={asset.url} controls preload="metadata" className="w-full" />
                </div>
              );
            }
            return (
              <video
                key={asset.id}
                src={asset.url}
                controls
                preload="metadata"
                className="card w-full"
              />
            );
          })}
      </div>
    </div>
  );
}
