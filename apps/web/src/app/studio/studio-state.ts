import { MAX_BATCH_IMAGES } from "@creative-ai/shared-types";
import type { Model3dQuality } from "@creative-ai/shared-types";
import type {
  CameraPresetId,
  LensPresetId,
  LookPresetId,
} from "@creative-ai/prompt-library";
import type {
  ImageSize,
  VideoRatio,
  VideoResolution,
} from "@creative-ai/shared-types";

export type StudioMode = "image" | "video" | "voice" | "model3d";
export type VoiceStyle = "standard" | "expressive";
export type { ImageSize, VideoRatio, VideoResolution };

export interface StudioAsset {
  id: string;
  type: "image" | "video" | "audio" | "model3d";
  url: string;
}

export type StudioPhase =
  | "idle"
  | "submitting"
  | "queued"
  | "processing"
  | "complete"
  | "failed";

export interface StudioState {
  mode: StudioMode;
  prompt: string;
  voiceStyle: VoiceStyle;
  imageSize: ImageSize;
  resolution: VideoResolution;
  ratio: VideoRatio;
  durationSeconds: number;
  /** Asset id used as the video's first frame (image-to-video), if any. */
  firstFrameAssetId: string | null;
  /** Asset id the video should end on. Together with a first frame this is a
   * keyframe transition: generate the motion between two stills. */
  lastFrameAssetId: string | null;
  /** Polygon budget preset for a 3D mesh. */
  model3dQuality: Model3dQuality;
  /** How many images a single image job should return (batch). */
  imageCount: number;
  /**
   * Camera moves to stack onto the prompt, in the order chosen — "dolly in,
   * then tilt up" is a sequence, not an unordered set.
   */
  cameraPresetIds: readonly CameraPresetId[];
  lensPresetId: LensPresetId | null;
  lookPresetId: LookPresetId | null;
  /**
   * Clips to extend or edit. Order is meaningful: prompts address them as
   * "[Video 1]", "[Video 2]". One clip extends it; two or three generate the
   * transitions between them.
   */
  sourceVideoAssetIds: readonly string[];
  /**
   * Reference images for multi-reference image-to-image. Order is meaningful:
   * prompts address them positionally ("image 1", "image 2").
   */
  referenceAssetIds: readonly string[];
  phase: StudioPhase;
  jobId: string | null;
  errorMessage: string | null;
  assets: readonly StudioAsset[];
}

// Defaults mirror the previously hardcoded profiles, so a user who touches
// nothing gets exactly what they got before these controls existed.
export const INITIAL_STUDIO_STATE: StudioState = {
  mode: "image",
  prompt: "",
  voiceStyle: "standard",
  imageSize: "4K",
  imageCount: 1,
  model3dQuality: "standard",
  resolution: "720p",
  ratio: "21:9",
  durationSeconds: 5,
  firstFrameAssetId: null,
  lastFrameAssetId: null,
  cameraPresetIds: [],
  lensPresetId: null,
  lookPresetId: null,
  sourceVideoAssetIds: [],
  referenceAssetIds: [],
  phase: "idle",
  jobId: null,
  errorMessage: null,
  assets: [],
};

export type StudioAction =
  | { type: "SET_MODE"; mode: StudioMode }
  | { type: "SET_PROMPT"; prompt: string }
  | { type: "SET_VOICE_STYLE"; voiceStyle: VoiceStyle }
  | { type: "SET_IMAGE_SIZE"; imageSize: ImageSize }
  | { type: "SET_IMAGE_COUNT"; imageCount: number }
  | { type: "SET_MODEL3D_QUALITY"; quality: Model3dQuality }
  | { type: "SET_RESOLUTION"; resolution: VideoResolution }
  | { type: "SET_RATIO"; ratio: VideoRatio }
  | { type: "SET_DURATION"; durationSeconds: number }
  | { type: "SET_FIRST_FRAME"; assetId: string | null }
  | { type: "SET_LAST_FRAME"; assetId: string | null }
  | { type: "TOGGLE_CAMERA_PRESET"; presetId: CameraPresetId }
  | { type: "SET_LENS_PRESET"; presetId: LensPresetId | null }
  | { type: "SET_LOOK_PRESET"; presetId: LookPresetId | null }
  | { type: "TOGGLE_SOURCE_VIDEO"; assetId: string }
  | { type: "TOGGLE_REFERENCE"; assetId: string }
  | { type: "SET_REFERENCES"; assetIds: readonly string[] }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_ERROR"; message: string }
  | { type: "JOB_QUEUED"; jobId: string }
  | {
      type: "STATUS_EVENT";
      status: "processing" | "complete" | "failed";
      errorMessage?: string;
      assets?: readonly StudioAsset[];
    };

/**
 * "adaptive" takes its ratio from an input image, so clearing the last keyframe
 * would otherwise leave a ratio the server rejects. Falling back to the default
 * keeps the form always submittable.
 */
function withValidRatio(state: StudioState): StudioState {
  const hasInputImage =
    state.firstFrameAssetId !== null || state.lastFrameAssetId !== null;
  if (state.ratio === "adaptive" && !hasInputImage) {
    return { ...state, ratio: INITIAL_STUDIO_STATE.ratio };
  }
  return state;
}

/**
 * References and generated images share one ceiling of 15 (R9). Adding a
 * reference can therefore push an already-chosen count out of range; clamping
 * here keeps the state submittable instead of letting the server reject it
 * with no visible cause.
 */
function withAffordableCount(state: StudioState): StudioState {
  const ceiling = Math.max(1, MAX_BATCH_IMAGES - state.referenceAssetIds.length);
  return state.imageCount <= ceiling
    ? state
    : { ...state, imageCount: ceiling };
}

export function studioReducer(
  state: StudioState,
  action: StudioAction,
): StudioState {
  switch (action.type) {
    case "SET_MODE":
      return { ...INITIAL_STUDIO_STATE, mode: action.mode, prompt: state.prompt };
    case "SET_PROMPT":
      return { ...state, prompt: action.prompt };
    case "SET_VOICE_STYLE":
      return { ...state, voiceStyle: action.voiceStyle };
    case "SET_IMAGE_SIZE":
      return { ...state, imageSize: action.imageSize };
    case "SET_IMAGE_COUNT":
      return { ...state, imageCount: action.imageCount };
    case "SET_MODEL3D_QUALITY":
      return { ...state, model3dQuality: action.quality };
    case "SET_RESOLUTION":
      return { ...state, resolution: action.resolution };
    case "SET_RATIO":
      return { ...state, ratio: action.ratio };
    case "SET_DURATION":
      return { ...state, durationSeconds: action.durationSeconds };
    case "SET_FIRST_FRAME":
      return withValidRatio({ ...state, firstFrameAssetId: action.assetId });
    case "SET_LAST_FRAME":
      return withValidRatio({ ...state, lastFrameAssetId: action.assetId });
    case "TOGGLE_CAMERA_PRESET": {
      const present = state.cameraPresetIds.includes(action.presetId);
      return {
        ...state,
        // Appended, so the order the user clicks is the order the moves are
        // described in the prompt.
        cameraPresetIds: present
          ? state.cameraPresetIds.filter((id) => id !== action.presetId)
          : [...state.cameraPresetIds, action.presetId],
      };
    }
    case "SET_LENS_PRESET":
      return { ...state, lensPresetId: action.presetId };
    case "SET_LOOK_PRESET":
      return { ...state, lookPresetId: action.presetId };
    case "TOGGLE_SOURCE_VIDEO": {
      const present = state.sourceVideoAssetIds.includes(action.assetId);
      return {
        ...state,
        // Appended, so selection order is send order — what "[Video 1]" and
        // "[Video 2]" in the prompt refer to.
        sourceVideoAssetIds: present
          ? state.sourceVideoAssetIds.filter((id) => id !== action.assetId)
          : [...state.sourceVideoAssetIds, action.assetId],
      };
    }
    case "SET_REFERENCES":
      return withAffordableCount({ ...state, referenceAssetIds: action.assetIds });
    case "TOGGLE_REFERENCE": {
      const present = state.referenceAssetIds.includes(action.assetId);
      return withAffordableCount({
        ...state,
        // Appended rather than inserted, so selection order is the order the
        // provider receives — which is what "image 1"/"image 2" refer to.
        referenceAssetIds: present
          ? state.referenceAssetIds.filter((id) => id !== action.assetId)
          : [...state.referenceAssetIds, action.assetId],
      });
    }
    case "SUBMIT_START":
      return { ...state, phase: "submitting", errorMessage: null, assets: [] };
    case "SUBMIT_ERROR":
      return { ...state, phase: "idle", errorMessage: action.message };
    case "JOB_QUEUED":
      return {
        ...state,
        phase: "queued",
        jobId: action.jobId,
        errorMessage: null,
      };
    case "STATUS_EVENT":
      if (action.status === "processing") {
        return { ...state, phase: "processing" };
      }
      if (action.status === "complete") {
        return { ...state, phase: "complete", assets: action.assets ?? [] };
      }
      return {
        ...state,
        phase: "failed",
        errorMessage: action.errorMessage ?? "Generation failed.",
      };
    default:
      return state;
  }
}
