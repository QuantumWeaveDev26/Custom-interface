export type VoiceClonePhase = "idle" | "encoding" | "uploading" | "complete" | "failed";

export interface VoiceCloneState {
  fileName: string | null;
  consent: boolean;
  phase: VoiceClonePhase;
  errorMessage: string | null;
  speakerId: string | null;
  trainingStatus: number | null;
  demoAudioUrl: string | null;
}

export const INITIAL_VOICE_CLONE_STATE: VoiceCloneState = {
  fileName: null,
  consent: false,
  phase: "idle",
  errorMessage: null,
  speakerId: null,
  trainingStatus: null,
  demoAudioUrl: null,
};

export type VoiceCloneAction =
  | { type: "SET_FILE"; fileName: string }
  | { type: "SET_CONSENT"; consent: boolean }
  | { type: "START_ENCODING" }
  | { type: "START_UPLOADING" }
  | {
      type: "COMPLETE";
      speakerId: string;
      trainingStatus: number;
      demoAudioUrl: string | null;
    }
  | { type: "ERROR"; message: string };

export function voiceCloneReducer(
  state: VoiceCloneState,
  action: VoiceCloneAction,
): VoiceCloneState {
  switch (action.type) {
    case "SET_FILE":
      return { ...state, fileName: action.fileName, phase: "idle", errorMessage: null };
    case "SET_CONSENT":
      return { ...state, consent: action.consent };
    case "START_ENCODING":
      return {
        ...state,
        phase: "encoding",
        errorMessage: null,
        speakerId: null,
        trainingStatus: null,
        demoAudioUrl: null,
      };
    case "START_UPLOADING":
      return { ...state, phase: "uploading" };
    case "COMPLETE":
      return {
        ...state,
        phase: "complete",
        speakerId: action.speakerId,
        trainingStatus: action.trainingStatus,
        demoAudioUrl: action.demoAudioUrl,
      };
    case "ERROR":
      return { ...state, phase: "failed", errorMessage: action.message };
    default:
      return state;
  }
}
