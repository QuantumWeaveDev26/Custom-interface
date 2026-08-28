export type StudioMode = "image" | "video" | "voice";
export type VoiceStyle = "standard" | "expressive";

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
  phase: StudioPhase;
  jobId: string | null;
  errorMessage: string | null;
  assets: readonly StudioAsset[];
}

export const INITIAL_STUDIO_STATE: StudioState = {
  mode: "image",
  prompt: "",
  voiceStyle: "standard",
  phase: "idle",
  jobId: null,
  errorMessage: null,
  assets: [],
};

export type StudioAction =
  | { type: "SET_MODE"; mode: StudioMode }
  | { type: "SET_PROMPT"; prompt: string }
  | { type: "SET_VOICE_STYLE"; voiceStyle: VoiceStyle }
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
