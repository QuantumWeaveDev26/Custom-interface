"use client";

import {
  IMAGE_SIZES,
  MAX_BATCH_IMAGES,
  MODEL3D_QUALITIES,
  VIDEO_RATIOS,
  type VideoResolution,
  type VideoResolutionLimits,
} from "@creative-ai/shared-types";

import {
  ClockIcon,
  SoundIcon,
  FrameIcon,
  QualityIcon,
  StackIcon,
} from "./chip-icons";
import type { StudioAction, StudioState } from "./studio-state";

/**
 * The settings that belong beside the prompt.
 *
 * These are the ones a user changes between takes — size, framing, duration,
 * how many. They sit in the composer with the prompt and the action, so the
 * decision and the thing it costs are read together. The heavier setup that is
 * chosen once for a session — references, saved characters, camera moves, lens
 * and look — stays in the left panel.
 *
 * Only what the current department can actually use is rendered; a video
 * duration chip on an image job is a control that does nothing.
 */
export function ComposerSettings({
  state,
  dispatch,
  disabled,
  videoResolutionLimits,
}: {
  state: StudioState;
  dispatch: (action: StudioAction) => void;
  disabled: boolean;
  videoResolutionLimits: VideoResolutionLimits;
}) {
  // 4K and 30s live in different models, so the duration ceiling depends on the
  // resolution currently chosen rather than being fixed for the page.
  const limit = videoResolutionLimits[state.resolution];
  const minDurationSeconds = limit?.minDurationSeconds ?? 4;
  const maxDurationSeconds = limit?.maxDurationSeconds ?? 5;
  const videoResolutions = Object.keys(videoResolutionLimits) as VideoResolution[];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {state.mode === "image" && (
        <>
          <Cycle
            label="Size"
            icon={<QualityIcon />}
            value={state.imageSize}
            options={IMAGE_SIZES}
            disabled={disabled}
            onPick={(imageSize) => dispatch({ type: "SET_IMAGE_SIZE", imageSize })}
          />
          <Stepper
            label="Images"
            icon={<StackIcon />}
            value={state.imageCount}
            min={1}
            // References and generated images share one ceiling of 15, so the
            // maximum shrinks as references are added rather than offering a
            // number the server would reject.
            max={Math.max(1, MAX_BATCH_IMAGES - state.referenceAssetIds.length)}
            disabled={disabled}
            onChange={(imageCount) => dispatch({ type: "SET_IMAGE_COUNT", imageCount })}
          />
        </>
      )}

      {state.mode === "video" && (
        <>
          <Cycle
            label="Resolution"
            icon={<QualityIcon />}
            value={state.resolution}
            options={videoResolutions}
            disabled={disabled}
            onPick={(resolution) => {
              dispatch({ type: "SET_RESOLUTION", resolution });
              // Switching to 4K moves the job to a model that caps at 15s. A
              // duration left above the new ceiling would be rejected by the
              // server after the user had already chosen it, so it is brought
              // down here instead.
              const ceiling =
                videoResolutionLimits[resolution]?.maxDurationSeconds ?? 5;
              if (state.durationSeconds > ceiling) {
                dispatch({ type: "SET_DURATION", durationSeconds: ceiling });
              }
            }}
          />
          <Cycle
            label="Aspect ratio"
            icon={<FrameIcon />}
            value={state.ratio}
            options={VIDEO_RATIOS.filter(
              // "adaptive" derives the ratio from an input image, so it is only
              // offered once there is one to derive from.
              (ratio) =>
                ratio !== "adaptive" ||
                state.firstFrameAssetId !== null ||
                state.lastFrameAssetId !== null,
            )}
            disabled={disabled}
            onPick={(ratio) => dispatch({ type: "SET_RATIO", ratio })}
          />
          {/* Sound is a two-state chip rather than a checkbox so it sits in
              the same row as the other per-take settings and reads at a
              glance. Off by default — see withAudio in shared-types. */}
          <Cycle
            label="Sound"
            icon={<SoundIcon />}
            value={state.withAudio ? "sound" : "silent"}
            options={["silent", "sound"] as const}
            disabled={disabled}
            onPick={(choice) =>
              dispatch({ type: "SET_AUDIO", withAudio: choice === "sound" })
            }
          />
          <Stepper
            label="Duration"
            icon={<ClockIcon />}
            value={state.durationSeconds}
            suffix="s"
            min={minDurationSeconds}
            max={maxDurationSeconds}
            disabled={disabled}
            onChange={(durationSeconds) =>
              dispatch({ type: "SET_DURATION", durationSeconds })
            }
          />
        </>
      )}

      {state.mode === "model3d" && (
        <Cycle
          label="Detail"
          icon={<QualityIcon />}
          value={state.model3dQuality}
          options={MODEL3D_QUALITIES}
          disabled={disabled}
          onPick={(quality) => dispatch({ type: "SET_MODEL3D_QUALITY", quality })}
        />
      )}

      {state.mode === "voice" && (
        <Cycle
          label="Voice"
          icon={<QualityIcon />}
          value={state.voiceStyle}
          options={["standard", "expressive"] as const}
          disabled={disabled}
          onPick={(voiceStyle) => dispatch({ type: "SET_VOICE_STYLE", voiceStyle })}
        />
      )}
    </div>
  );
}

/**
 * A chip that advances through its options on click.
 *
 * Chosen over a dropdown because these lists are short and the current value is
 * the thing worth showing; a select would hide it behind a control. The full
 * list stays reachable by keyboard through the same activation.
 */
function Cycle<T extends string>({
  label,
  icon,
  value,
  options,
  disabled,
  onPick,
}: {
  label: string;
  icon: React.ReactNode;
  value: T;
  options: readonly T[];
  disabled: boolean;
  onPick: (value: T) => void;
}) {
  const index = options.indexOf(value);
  const next = options[(index + 1) % options.length] ?? value;

  return (
    <button
      type="button"
      disabled={disabled || options.length < 2}
      onClick={() => onPick(next)}
      className="opt capitalize"
      title={`${label}: ${value}. Click for ${next}.`}
      aria-label={`${label}, ${value}. Click to change to ${next}.`}
    >
      {icon}
      <span className="val text-[13px]">{value}</span>
    </button>
  );
}

/** A chip carrying a number with its own minus and plus. */
function Stepper({
  label,
  icon,
  value,
  min,
  max,
  suffix = "",
  disabled,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <span className="opt !px-2" data-active="false">
      {icon}
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
        aria-label={`Decrease ${label}`}
        className="px-1.5 text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30"
      >
        −
      </button>
      <span className="val min-w-[2.5ch] text-center text-[13px]">
        {value}
        {suffix}
      </span>
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        aria-label={`Increase ${label}`}
        className="px-1.5 text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30"
      >
        +
      </button>
    </span>
  );
}
