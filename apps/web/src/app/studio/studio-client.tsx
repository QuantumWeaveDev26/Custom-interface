"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  IMAGE_SIZES,
  MAX_BATCH_IMAGES,
  MODEL3D_QUALITIES,
  MODEL3D_QUALITY_PRESETS,
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
import { AttachButton, type Attachment } from "../attach-button";
import { ReferencePicker } from "./reference-picker";
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
  model3dModelLabel: string;
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

const MODES: StudioMode[] = ["image", "video", "voice", "model3d"];
const MODE_LABELS: Record<StudioMode, string> = {
  image: "Image",
  video: "Video",
  voice: "Voice",
  model3d: "3D",
};

export function StudioClient({
  creditBalance,
  imageModelLabel,
  videoModelLabel,
  voiceModelLabel,
  model3dModelLabel,
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
  // Attachments made from the prompt box. Tracked separately only so the chips
  // can show file names; the selection itself lives in the reducer alongside
  // everything picked from the galleries, so submission stays one path.
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const handleAttached = useCallback((attachment: Attachment) => {
    setAttachments((previous) => [...previous, attachment]);
    dispatch(
      attachment.kind === "video"
        ? { type: "TOGGLE_SOURCE_VIDEO", assetId: attachment.assetId }
        : { type: "TOGGLE_REFERENCE", assetId: attachment.assetId },
    );
  }, []);

  const handleRemoveAttachment = useCallback(
    (assetId: string) => {
      const removed = attachments.find((item) => item.assetId === assetId);
      if (removed === undefined) return;
      setAttachments((previous) => previous.filter((item) => item.assetId !== assetId));
      dispatch(
        removed.kind === "video"
          ? { type: "TOGGLE_SOURCE_VIDEO", assetId }
          : { type: "TOGGLE_REFERENCE", assetId },
      );
    },
    [attachments],
  );

  const pickableImageIds = useMemo(
    () => [...uploadedIds, ...recentImageIds],
    [uploadedIds, recentImageIds],
  );

  const uploadImage = useCallback(
    async (
      event: React.ChangeEvent<HTMLInputElement>,
      target: "reference" | "keyframe",
    ) => {
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
        // Select it straight away, into whichever picker the upload came from.
        // Video mode has two, so the caller says which — inferring it from the
        // mode would put every uploaded face into the first-frame slot.
        dispatch(
          target === "reference"
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
    [frameSlot],
  );

  const handleUploadReference = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => uploadImage(event, "reference"),
    [uploadImage],
  );
  const handleUploadKeyframe = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => uploadImage(event, "keyframe"),
    [uploadImage],
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
    if (state.mode === "image")
      return { type: "image", size: state.imageSize, count: state.imageCount };
    if (state.mode === "voice") return { type: "voice", style: state.voiceStyle };
    if (state.mode === "model3d")
      return { type: "model3d", quality: state.model3dQuality };
    return {
      type: "video",
      resolution: state.resolution,
      ratio: state.ratio,
      durationSeconds: state.durationSeconds,
    };
  }, [
    state.mode,
    state.imageSize,
    state.imageCount,
    state.model3dQuality,
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
      // Omni reference (R4): the 2.0 series accepts reference images on a video
      // task, which is how a saved character carries into a shot.
      ...state.referenceAssetIds.map((assetId) => ({
        assetId,
        role: "reference" as const,
      })),
    ],
    [
      state.firstFrameAssetId,
      state.lastFrameAssetId,
      state.sourceVideoAssetIds,
      state.referenceAssetIds,
    ],
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

  const submitGeneration = useCallback(
    async () => {
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
            ...(state.mode === "model3d" && state.referenceAssetIds.length > 0
              ? {
                  inputAssets: state.referenceAssetIds.map((assetId) => ({
                    assetId,
                    role: "reference",
                  })),
                }
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

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void submitGeneration();
    },
    [submitGeneration],
  );

  const modelLabel =
    state.mode === "image"
      ? imageModelLabel
      : state.mode === "video"
        ? videoModelLabel
        : state.mode === "model3d"
          ? model3dModelLabel
          : voiceModelLabel;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      {/* The report header: what sheet this is, and what stock is left. */}
      <header
        className="flex flex-wrap items-end justify-between gap-4 border-b pb-3"
        style={{ borderColor: "var(--border-strong)" }}
      >
        <div>
          <p className="field-label">Camera report</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Studio</h1>
        </div>
        <div className="text-right">
          <p className="field-label">Stock remaining</p>
          <p className="tabular mt-1 font-mono text-lg leading-none text-[var(--text)]">
            {creditBalance}
            <span className="ml-1.5 text-[11px] text-[var(--text-faint)]">cr</span>
          </p>
        </div>
      </header>

      {/* Department: which crew is working this take. Segmented and ruled, not
          a row of capsules. */}
      <div className="mt-5">
        <p className="field-label">Department</p>
        <div
          className="mt-1.5 flex divide-x overflow-hidden border"
          role="radiogroup"
          aria-label="Generation mode"
          style={{ borderColor: "var(--border)", borderRadius: "2px" }}
        >
          {MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={state.mode === mode}
              disabled={isBusy}
              data-active={state.mode === mode}
              onClick={() => {
                // SET_MODE clears every selection in the reducer, so the chips
                // must go with them or they would name assets no longer in use.
                setAttachments([]);
                dispatch({ type: "SET_MODE", mode });
              }}
              // A segment of one ruled bar, marked by an inked bottom rule
              // rather than filled like a tab.
              className="flex-1 px-3 py-2 text-xs font-medium transition-colors duration-150 disabled:opacity-40"
              style={{
                borderColor: "var(--border)",
                color:
                  state.mode === mode ? "var(--text)" : "var(--text-muted)",
                background:
                  state.mode === mode ? "var(--surface)" : "transparent",
                boxShadow:
                  state.mode === mode ? "inset 0 -2px 0 0 var(--pencil)" : "none",
              }}
            >
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-2 font-mono text-[11px] text-[var(--text-faint)]">
        <span className="field-label">Model</span>{" "}
        <span className="text-[var(--text-muted)]">{modelLabel}</span>
      </p>

      {/* A workspace, not a column of stacked rows: setup on the left where a
          form is filled, the viewer on the right where the work is judged, and
          the notes field pinned across the foot so the primary action never
          sits below the fold. Grid areas place them, so DOM order stays
          fill-the-form then read-the-result for a keyboard user. */}
      <div className="studio-grid mt-4">
        <div className="setup-col space-y-4" style={{ gridArea: "setup" }}>

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
              className="opt"
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
          <ReferencePicker
            inputId="upload-reference"
            label="Reference images"
            hint="(optional — keeps a character or style consistent)"
            promptHint={"Refer to them in your prompt as “image 1”, “image 2”, and so on."}
            pickableImageIds={pickableImageIds}
            selectedIds={state.referenceAssetIds}
            characters={savedCharacters}
            characterName={characterName}
            disabled={isBusy}
            uploading={uploading}
            savingCharacter={savingCharacter}
            uploadError={uploadError}
            characterError={characterError}
            onUpload={handleUploadReference}
            onToggle={(assetId) => dispatch({ type: "TOGGLE_REFERENCE", assetId })}
            onLoadCharacter={handleLoadCharacter}
            onDeleteCharacter={handleDeleteCharacter}
            onCharacterNameChange={setCharacterName}
            onSaveCharacter={handleSaveCharacter}
          />

          <p className="field-label mb-1.5 mt-3 block">
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
                className="opt"
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      )}

      {state.mode === "video" && (
        <div className="mt-3">
          <p className="field-label mb-1.5 block">
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
                className="opt"
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
              className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[2px] border border-dashed text-[10px] transition-colors ${
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
              onChange={handleUploadKeyframe}
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
                  className="relative shrink-0 overflow-hidden rounded-[2px] transition-all disabled:opacity-50"
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
                      className="absolute right-1 top-1 rounded-[2px] px-1.5 text-[9px] font-bold text-white"
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

      {state.mode === "video" && (
        <ReferencePicker
          inputId="upload-video-reference"
          label="Keep a character"
          hint="(optional — the same face or subject across shots)"
          promptHint={"Refer to them in your prompt as “Image 1”, “Image 2”, and so on."}
          pickableImageIds={pickableImageIds}
          selectedIds={state.referenceAssetIds}
          characters={savedCharacters}
          characterName={characterName}
          disabled={isBusy}
          uploading={uploading}
          savingCharacter={savingCharacter}
          uploadError={uploadError}
          characterError={characterError}
          onUpload={handleUploadReference}
          onToggle={(assetId) => dispatch({ type: "TOGGLE_REFERENCE", assetId })}
          onLoadCharacter={handleLoadCharacter}
          onDeleteCharacter={handleDeleteCharacter}
          onCharacterNameChange={setCharacterName}
          onSaveCharacter={handleSaveCharacter}
        />
      )}

      {state.mode === "video" && recentVideoIds.length > 0 && (
        <div className="mt-3">
          <p className="field-label mb-1.5 block">
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
                  className="relative shrink-0 overflow-hidden rounded-[2px] transition-all disabled:opacity-40"
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
                      className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-[2px] text-[10px] font-bold text-white"
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
            <p className="field-label mb-1.5 block">
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
                  className="opt"
                >
                  {resolution}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="field-label mb-1.5 block">
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
                  className="opt"
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="duration"
              className="field-label mb-1.5 flex items-center justify-between"
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

      {(state.mode === "image" || state.mode === "video") && (
        <div className="mt-3 space-y-3">
          {state.mode === "video" && (
            <div>
              <p className="field-label mb-1.5 block">
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
                      className="opt"
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
            <p className="field-label mb-1.5 block">
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
                    className="opt"
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
            <p className="field-label mb-1.5 block">
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
                    className="opt"
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

      {state.mode === "model3d" && (
        <div className="mt-3">
          <p className="field-label mb-1.5 block">
            Detail
          </p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Mesh detail">
            {MODEL3D_QUALITIES.map((quality) => (
              <button
                key={quality}
                type="button"
                role="radio"
                aria-checked={state.model3dQuality === quality}
                disabled={isBusy}
                data-active={state.model3dQuality === quality}
                onClick={() => dispatch({ type: "SET_MODEL3D_QUALITY", quality })}
                className="opt capitalize"
              >
                {quality}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
            {MODEL3D_QUALITY_PRESETS[state.model3dQuality].toLocaleString()} polygons,
            PBR materials, exported as .glb. Attach a photo below to model that
            object instead of describing one. Takes a couple of minutes and the
            file is large — around 25 MB.
          </p>
        </div>
      )}

        </div>

        <div style={{ gridArea: "notes" }}>
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

        {state.mode !== "voice" && (
          <AttachButton
            attachments={attachments}
            disabled={isBusy}
            // A still has nothing to do with a video file, so 3D and Image only
            // offer images. Video mode takes both.
            accept={state.mode === "video" ? "images-and-video" : "images"}
            hint={
              state.mode === "video"
                ? "Images keep a subject consistent; a clip is extended or edited. Address them in the prompt as “Image 1”, “Video 1”."
                : "Address them in the prompt as “image 1”, “image 2”."
            }
            onAttached={handleAttached}
            onRemove={handleRemoveAttachment}
          />
        )}

        {composedPrompt !== state.prompt && state.prompt.trim().length > 0 && (
          <div className="rounded-[2px] border p-2.5" style={{ borderColor: "var(--border)" }}>
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
        </div>

        <div style={{ gridArea: "viewer" }}>
      <div className="mt-6" aria-live="polite">
        {(state.phase === "queued" || state.phase === "processing") && (
          <div className="card flex items-center gap-3 p-4">
            <span className="spinner text-[var(--pencil)]" aria-hidden="true" />
            <div>
              {/* State is stamped in its own words, so it reads without colour
                  and survives a monochrome print. */}
              <span className="stamp text-[var(--text-faint)]">
                {state.phase === "queued" ? "Slated" : "Rolling"}
              </span>
              <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                {state.phase === "queued"
                  ? "Queued behind other takes."
                  : "The provider is generating. This can take a couple of minutes."}
              </p>
            </div>
          </div>
        )}
        {state.phase === "failed" && (
          <div className="card p-4" style={{ borderColor: "var(--pencil-dim)" }}>
            <span className="stamp text-[var(--danger)]">No good</span>
            <p className="mt-2 text-sm text-[var(--text-muted)]">{state.errorMessage}</p>
            {/* The prompt and every setting are still on screen, so a failure
                that was transient — a busy provider, a timeout — should not
                cost the user a round trip through the form to retry. */}
            <button
              type="button"
              onClick={() => void submitGeneration()}
              disabled={!affordable}
              className="btn-secondary mt-3 !px-4 !py-2 text-xs"
            >
              Try again · {estimatedCost} credit{estimatedCost === 1 ? "" : "s"}
            </button>
          </div>
        )}
        {/* Session scratch: the result panel above is cleared on the next
            submit, so without this the previous attempt vanishes the moment a
            variation is tried. The Gallery remains the durable record. */}
        {state.history.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="field-label">
                Takes this session
                <span className="tabular ml-2 font-mono text-[var(--text-muted)]">
                  {String(state.history.length).padStart(2, "0")}
                </span>
              </p>
              <a
                href="/gallery"
                className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                All results →
              </a>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {state.history.map((asset, index) => (
                <a
                  key={asset.id}
                  href={asset.url}
                  target="_blank"
                  rel="noreferrer"
                  title="Open full size"
                  className="relative shrink-0 overflow-hidden rounded-[2px]"
                  style={{ border: "1px solid var(--border)" }}
                >
                  {/* Counted backwards from the newest, so take 01 stays take
                      01 as the session grows. */}
                  <span
                    className="tabular absolute left-0 top-0 z-10 px-1 font-mono text-[9px] font-bold text-white"
                    style={{ background: "rgba(0,0,0,0.65)" }}
                  >
                    {String(state.history.length - index).padStart(2, "0")}
                  </span>
                  {asset.type === "image" ? (
                    <img src={asset.url} alt="" className="h-16 w-16 object-cover" />
                  ) : asset.type === "video" ? (
                    <video
                      src={asset.url}
                      preload="metadata"
                      muted
                      className="h-16 w-24 object-cover"
                    />
                  ) : (
                    <span className="flex h-16 w-16 items-center justify-center bg-[var(--bg-elevated)] text-[10px] text-[var(--text-muted)]">
                      {asset.type === "audio" ? "Voice" : "3D"}
                    </span>
                  )}
                </a>
              ))}
            </div>
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
            if (asset.type === "model3d") {
              return (
                <div key={asset.id} className="card p-4">
                  <p className="text-sm text-[var(--text-muted)]">
                    3D mesh ready — .glb with PBR materials.
                  </p>
                  <a
                    href={asset.url}
                    download
                    className="btn-secondary mt-3 !px-4 !py-2 text-sm"
                  >
                    Download mesh
                  </a>
                </div>
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
      </div>
    </div>
  );
}
