import type {
  ImageSize,
  VideoRatio,
  VideoResolution,
} from "@creative-ai/shared-types";

export type StudioMode = "image" | "video" | "voice";
export type VoiceStyle = "standard" | "expressive";
export type { ImageSize, VideoRatio, VideoResolution };

export interface StudioAsset {
  id: string;
  type: "image" | "video" | "audio";
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
  resolution: "720p",
  ratio: "21:9",
  durationSeconds: 5,
  firstFrameAssetId: null,
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
  | { type: "SET_RESOLUTION"; resolution: VideoResolution }
  | { type: "SET_RATIO"; ratio: VideoRatio }
  | { type: "SET_DURATION"; durationSeconds: number }
  | { type: "SET_FIRST_FRAME"; assetId: string | null }
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
    case "SET_RESOLUTION":
      return { ...state, resolution: action.resolution };
    case "SET_RATIO":
      return { ...state, ratio: action.ratio };
    case "SET_DURATION":
      return { ...state, durationSeconds: action.durationSeconds };
    case "SET_FIRST_FRAME":
      return { ...state, firstFrameAssetId: action.assetId };
    case "SET_REFERENCES":
      return { ...state, referenceAssetIds: action.assetIds };
    case "TOGGLE_REFERENCE": {
      const present = state.referenceAssetIds.includes(action.assetId);
      return {
        ...state,
        // Appended rather than inserted, so selection order is the order the
        // provider receives — which is what "image 1"/"image 2" refer to.
        referenceAssetIds: present
          ? state.referenceAssetIds.filter((id) => id !== action.assetId)
          : [...state.referenceAssetIds, action.assetId],
      };
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
