"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  IMAGE_SIZES,
  MAX_SOURCE_VIDEOS_PER_JOB,
  VIDEO_RATIOS,
  creditCostFor,
  ratioRequiresInputImage,
  type CreditPricing,
  type GenerationParams,
  type VideoResolution,
} from "@creative-ai/shared-types";
import {
  CAMERA_PRESETS,
  LENS_PRESETS,
  LOOK_PRESETS,
  composeShotPrompt,
} from "@creative-ai/prompt-library";
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
  /** Recent clips the user owns, offered as source videos for extend/edit. */
  recentVideoIds: readonly string[];
  /** Saved named characters — reusable reference sets. */
  characters: readonly { id: string; name: string; assetIds: string[] }[];
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
  recentVideoIds,
  characters,
}: StudioClientProps) {
  const [state, dispatch] = useReducer(studioReducer, INITIAL_STUDIO_STATE);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Images uploaded during this session, newest first. Kept in component state
  // rather than refetching the page so the picker updates immediately.
  const [uploadedIds, setUploadedIds] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // Which keyframe slot a thumbnail click fills. UI-only: the reducer holds the
  // resulting selection, not the pointer to it.
  const [frameSlot, setFrameSlot] = useState<"first_frame" | "last_frame">(
    "first_frame",
  );
  const [savedCharacters, setSavedCharacters] = useState(characters);
  const [characterName, setCharacterName] = useState("");
  const [savingCharacter, setSavingCharacter] = useState(false);
  const [characterError, setCharacterError] = useState<string | null>(null);
  const pickableImageIds = useMemo(
    () => [...uploadedIds, ...recentImageIds],
    [uploadedIds, recentImageIds],
  );

  const handleUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Reset immediately so re-picking the same file still fires onChange.
      event.target.value = "";
      if (!file) return;

      setUploadError(null);
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("image", file);
        const response = await fetch("/api/uploads", {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          setUploadError(body.error ?? "Upload failed.");
          return;
        }
        const { assetId } = (await response.json()) as { assetId: string };
        setUploadedIds((previous) => [assetId, ...previous]);
        // Select it straight away, in whichever way this mode means "use it".
        dispatch(
          state.mode === "image"
            ? { type: "TOGGLE_REFERENCE", assetId }
            : frameSlot === "last_frame"
              ? { type: "SET_LAST_FRAME", assetId }
              : { type: "SET_FIRST_FRAME", assetId },
        );
      } catch {
        setUploadError("Could not reach the server.");
      } finally {
        setUploading(false);
      }
    },
    [state.mode, frameSlot],
  );


  const handleSaveCharacter = useCallback(async () => {
    const name = characterName.trim();
    if (name.length === 0 || state.referenceAssetIds.length === 0) return;

    setCharacterError(null);
    setSavingCharacter(true);
    try {
      const response = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, assetIds: state.referenceAssetIds }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setCharacterError(body.error ?? "Could not save character.");
        return;
      }
      const { character } = (await response.json()) as {
        character: { id: string; name: string; assetIds: string[] };
      };
      setSavedCharacters((previous) => [character, ...previous]);
      setCharacterName("");
    } catch {
      setCharacterError("Could not reach the server.");
    } finally {
      setSavingCharacter(false);
    }
  }, [characterName, state.referenceAssetIds]);

  const handleDeleteCharacter = useCallback(async (characterId: string) => {
    setCharacterError(null);
    const response = await fetch(`/api/characters/${characterId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setCharacterError("Could not delete character.");
      return;
    }
    setSavedCharacters((previous) =>
      previous.filter((character) => character.id !== characterId),
    );
  }, []);

  // Replaces the current selection wholesale rather than merging, so loading a
  // character gives exactly that character's references in its saved order --
  // which is what the numbered badges and the prompt then refer to.
  const handleLoadCharacter = useCallback((assetIds: readonly string[]) => {
    dispatch({ type: "SET_REFERENCES", assetIds: [...assetIds] });
  }, []);

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

  const videoInputAssets = useMemo(
    () => [
      ...[
        { assetId: state.firstFrameAssetId, role: "first_frame" as const },
        { assetId: state.lastFrameAssetId, role: "last_frame" as const },
      ].flatMap(({ assetId, role }) => (assetId === null ? [] : [{ assetId, role }])),
      ...state.sourceVideoAssetIds.map((assetId) => ({
        assetId,
        role: "source_video" as const,
      })),
    ],
    [state.firstFrameAssetId, state.lastFrameAssetId, state.sourceVideoAssetIds],
  );

  // "adaptive" copies the ratio of an input image, so it is only offered once
  // there is one — otherwise the server would reject the submission.
  const ratioOptions = useMemo(
    () =>
      VIDEO_RATIOS.filter(
        (ratio) => !ratioRequiresInputImage(ratio) || videoInputAssets.length > 0,
      ),
    [videoInputAssets],
  );

  // Camera moves only describe motion, so they are offered for video alone;
  // lens and look apply to a still just as well.
  const composedPrompt = useMemo(
    () =>
      composeShotPrompt({
        description: state.prompt,
        ...(state.mode === "video" ? { cameraPresetIds: state.cameraPresetIds } : {}),
        ...(state.lensPresetId === null ? {} : { lensPresetId: state.lensPresetId }),
        ...(state.lookPresetId === null ? {} : { lookPresetId: state.lookPresetId }),
      }),
    [
      state.prompt,
      state.mode,
      state.cameraPresetIds,
      state.lensPresetId,
      state.lookPresetId,
    ],
  );
  // The server caps prompts at 2000 characters. Presets push the composed
  // prompt past what the textarea alone allows, so the limit is checked on the
  // string that is actually submitted.
  const promptTooLong = composedPrompt.length > 2000;

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
            prompt: composedPrompt,
            // `type` is the request discriminator, not a params field.
            params: (({ type: _ignored, ...rest }) => rest)(params),
            ...(state.mode === "video" && videoInputAssets.length > 0
              ? { inputAssets: videoInputAssets }
              : {}),
            ...(state.mode === "image" && state.referenceAssetIds.length > 0
              ? {
                  inputAssets: state.referenceAssetIds.map((assetId) => ({
                    assetId,
                    role: "reference",
                  })),
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
    [isBusy, state.mode, state.prompt, composedPrompt, params, videoInputAssets, state.referenceAssetIds],
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
            Reference images{" "}
            <span className="normal-case tracking-normal">
              (optional — keeps a character or style consistent)
            </span>
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <label
              htmlFor="upload-reference"
              className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed text-[10px] transition-colors ${
                isBusy || uploading
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer hover:border-[var(--border-strong)]"
              }`}
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
            >
              {uploading ? (
                <span className="spinner h-4 w-4" aria-hidden="true" />
              ) : (
                <>
                  <span className="text-base leading-none">+</span>
                  <span>Upload</span>
                </>
              )}
            </label>
            <input
              id="upload-reference"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleUpload}
              disabled={isBusy || uploading}
              className="sr-only"
            />
            {pickableImageIds.map((assetId) => {
              const order = state.referenceAssetIds.indexOf(assetId);
              const selected = order !== -1;
              return (
                <button
                  key={assetId}
                  type="button"
                  disabled={isBusy}
                  aria-pressed={selected}
                  aria-label={
                    selected ? `Reference ${order + 1}, click to remove` : "Add as reference"
                  }
                  onClick={() => dispatch({ type: "TOGGLE_REFERENCE", assetId })}
                  className="relative shrink-0 overflow-hidden rounded-lg transition-all disabled:opacity-50"
                  style={{
                    border: selected
                      ? "2px solid var(--accent-via)"
                      : "2px solid var(--border)",
                  }}
                >
                  <img src={`/api/assets/${assetId}`} alt="" className="h-16 w-16 object-cover" />
                  {selected && (
                    // The number is the position the prompt can address as
                    // "image 1", "image 2" — selection order is send order.
                    <span
                      className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ background: "var(--accent-via)" }}
                    >
                      {order + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {uploadError !== null && (
            <p className="mt-1.5 text-[11px] text-[var(--danger)]">{uploadError}</p>
          )}
          {state.referenceAssetIds.length > 0 && (
            <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
              Refer to them in your prompt as “image 1”, “image 2”, and so on.
            </p>
          )}

          {savedCharacters.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
                Saved characters
              </p>
              <div className="flex flex-wrap gap-2">
                {savedCharacters.map((character) => (
                  <span
                    key={character.id}
                    className="inline-flex items-center gap-1 rounded-full border px-1 py-0.5 text-xs"
                    style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                  >
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleLoadCharacter(character.assetIds)}
                      className="rounded-full px-2 py-0.5 text-[var(--text)] disabled:opacity-50"
                      title={`Load ${character.assetIds.length} reference image(s)`}
                    >
                      {character.name}
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleDeleteCharacter(character.id)}
                      aria-label={`Delete character ${character.name}`}
                      className="px-1 text-[var(--text-faint)] hover:text-[var(--danger)] disabled:opacity-50"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {state.referenceAssetIds.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={characterName}
                onChange={(event) => setCharacterName(event.target.value)}
                disabled={isBusy || savingCharacter}
                maxLength={60}
                placeholder="Name this character…"
                className="input-field !w-48 !py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={handleSaveCharacter}
                disabled={
                  isBusy || savingCharacter || characterName.trim().length === 0
                }
                className="btn-secondary gap-1.5 !px-3 !py-1.5 text-xs"
              >
                {savingCharacter && <span className="spinner h-3 w-3" aria-hidden="true" />}
                Save {state.referenceAssetIds.length} as character
              </button>
            </div>
          )}
          {characterError !== null && (
            <p className="mt-1.5 text-[11px] text-[var(--danger)]">{characterError}</p>
          )}

          <p className="mb-1.5 mt-3 text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
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

      {state.mode === "video" && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
            Animate an image <span className="normal-case tracking-normal">(optional)</span>
          </p>
          <div className="mb-2 flex gap-2" role="radiogroup" aria-label="Keyframe slot">
            {(["first_frame", "last_frame"] as const).map((slot) => (
              <button
                key={slot}
                type="button"
                role="radio"
                aria-checked={frameSlot === slot}
                disabled={isBusy}
                data-active={frameSlot === slot}
                onClick={() => setFrameSlot(slot)}
                className="pill !px-3 !py-1.5 text-xs"
                style={
                  frameSlot !== slot
                    ? { background: "var(--surface)", border: "1px solid var(--border)" }
                    : undefined
                }
              >
                {slot === "first_frame" ? "First frame" : "Last frame"}
              </button>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <label
              htmlFor="upload-image"
              className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed text-[10px] transition-colors ${
                isBusy || uploading
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer hover:border-[var(--border-strong)]"
              }`}
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
            >
              {uploading ? (
                <span className="spinner h-4 w-4" aria-hidden="true" />
              ) : (
                <>
                  <span className="text-base leading-none">+</span>
                  <span>Upload</span>
                </>
              )}
            </label>
            <input
              id="upload-image"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleUpload}
              disabled={isBusy || uploading}
              className="sr-only"
            />
            {pickableImageIds.map((assetId) => {
              const isFirst = state.firstFrameAssetId === assetId;
              const isLast = state.lastFrameAssetId === assetId;
              const selectedInActiveSlot =
                frameSlot === "first_frame" ? isFirst : isLast;
              const badge = isFirst ? "1st" : isLast ? "last" : null;
              return (
                <button
                  key={assetId}
                  type="button"
                  disabled={isBusy}
                  aria-pressed={isFirst || isLast}
                  aria-label={
                    selectedInActiveSlot
                      ? `Remove as ${frameSlot === "first_frame" ? "first" : "last"} frame`
                      : `Use as ${frameSlot === "first_frame" ? "first" : "last"} frame`
                  }
                  // Clicking the image already in the active slot clears it, so
                  // text-to-video is always reachable without a "none" control.
                  onClick={() =>
                    dispatch({
                      type:
                        frameSlot === "first_frame"
                          ? "SET_FIRST_FRAME"
                          : "SET_LAST_FRAME",
                      assetId: selectedInActiveSlot ? null : assetId,
                    })
                  }
                  className="relative shrink-0 overflow-hidden rounded-lg transition-all disabled:opacity-50"
                  style={{
                    border:
                      isFirst || isLast
                        ? "2px solid var(--accent-via)"
                        : "2px solid var(--border)",
                  }}
                >
                  <img
                    src={`/api/assets/${assetId}`}
                    alt=""
                    className="h-16 w-16 object-cover"
                  />
                  {badge !== null && (
                    <span
                      className="absolute right-1 top-1 rounded-full px-1.5 text-[9px] font-bold text-white"
                      style={{ background: "var(--accent-via)" }}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {uploadError !== null && (
            <p className="mt-1.5 text-[11px] text-[var(--danger)]">{uploadError}</p>
          )}
          {videoInputAssets.length > 0 && (
            <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
              {state.firstFrameAssetId !== null && state.lastFrameAssetId !== null
                ? "The clip starts on the first image and ends on the last. Your prompt describes the motion between them."
                : state.firstFrameAssetId !== null
                  ? "This image becomes the first frame. Your prompt describes the motion."
                  : "The clip ends on this image. Your prompt describes how it gets there."}
            </p>
          )}
        </div>
      )}

      {state.mode === "video" && recentVideoIds.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
            Extend or edit a clip{" "}
            <span className="normal-case tracking-normal">
              (optional — pick up to {MAX_SOURCE_VIDEOS_PER_JOB})
            </span>
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {recentVideoIds.map((assetId) => {
              const order = state.sourceVideoAssetIds.indexOf(assetId);
              const selected = order !== -1;
              const atCap =
                !selected &&
                state.sourceVideoAssetIds.length >= MAX_SOURCE_VIDEOS_PER_JOB;
              return (
                <button
                  key={assetId}
                  type="button"
                  disabled={isBusy || atCap}
                  aria-pressed={selected}
                  aria-label={
                    selected ? `Clip ${order + 1}, click to remove` : "Add as a clip"
                  }
                  onClick={() => dispatch({ type: "TOGGLE_SOURCE_VIDEO", assetId })}
                  className="relative shrink-0 overflow-hidden rounded-lg transition-all disabled:opacity-40"
                  style={{
                    border: selected
                      ? "2px solid var(--accent-via)"
                      : "2px solid var(--border)",
                  }}
                >
                  <video
                    src={`/api/assets/${assetId}`}
                    preload="metadata"
                    muted
                    className="h-16 w-24 object-cover"
                  />
                  {selected && (
                    <span
                      className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ background: "var(--accent-via)" }}
                    >
                      {order + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {state.sourceVideoAssetIds.length > 0 && (
            <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
              {state.sourceVideoAssetIds.length === 1
                ? "Extending one clip usually returns only the new footage. To keep the original, say so in the prompt — e.g. “…and then end with Video 1”."
                : "Refer to them in your prompt as “Video 1”, “Video 2”. The result includes the originals plus the transitions between them."}
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
              {ratioOptions.map((ratio) => (
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

      {state.mode !== "voice" && (
        <div className="mt-3 space-y-3">
          {state.mode === "video" && (
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
                Camera move{" "}
                <span className="normal-case tracking-normal">
                  (optional — stack them, order matters)
                </span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {CAMERA_PRESETS.map((preset) => {
                  const order = state.cameraPresetIds.indexOf(preset.id);
                  const selected = order !== -1;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={isBusy}
                      aria-pressed={selected}
                      title={preset.description}
                      onClick={() =>
                        dispatch({ type: "TOGGLE_CAMERA_PRESET", presetId: preset.id })
                      }
                      className="pill !px-2.5 !py-1 text-[11px]"
                      data-active={selected}
                      style={
                        selected
                          ? undefined
                          : { background: "var(--surface)", border: "1px solid var(--border)" }
                      }
                    >
                      {selected && `${order + 1}. `}
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
              Lens <span className="normal-case tracking-normal">(optional)</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {LENS_PRESETS.map((preset) => {
                const selected = state.lensPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={isBusy}
                    aria-pressed={selected}
                    title={preset.description}
                    // Clicking the active lens clears it, so "no lens direction"
                    // stays reachable without a separate None control.
                    onClick={() =>
                      dispatch({
                        type: "SET_LENS_PRESET",
                        presetId: selected ? null : preset.id,
                      })
                    }
                    className="pill !px-2.5 !py-1 text-[11px]"
                    data-active={selected}
                    style={
                      selected
                        ? undefined
                        : { background: "var(--surface)", border: "1px solid var(--border)" }
                    }
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
              Look <span className="normal-case tracking-normal">(optional)</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {LOOK_PRESETS.map((preset) => {
                const selected = state.lookPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={isBusy}
                    aria-pressed={selected}
                    title={preset.description}
                    onClick={() =>
                      dispatch({
                        type: "SET_LOOK_PRESET",
                        presetId: selected ? null : preset.id,
                      })
                    }
                    className="pill !px-2.5 !py-1 text-[11px]"
                    data-active={selected}
                    style={
                      selected
                        ? undefined
                        : { background: "var(--surface)", border: "1px solid var(--border)" }
                    }
                  >
                    {preset.label}
                  </button>
                );
              })}
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
        {composedPrompt !== state.prompt && state.prompt.trim().length > 0 && (
          <div className="rounded-lg border p-2.5" style={{ borderColor: "var(--border)" }}>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
              Sent to the model
            </p>
            <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
              {composedPrompt}
            </p>
          </div>
        )}
        {promptTooLong && (
          <p className="text-xs text-[var(--danger)]">
            Prompt is {composedPrompt.length} characters with presets applied — the
            limit is 2000. Shorten it or drop a preset.
          </p>
        )}
        <button
          type="submit"
          disabled={
            isBusy || state.prompt.trim().length === 0 || !affordable || promptTooLong
          }
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
