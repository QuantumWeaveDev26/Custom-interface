export type VoiceCloneStatus = "idle" | "encoding" | "uploading" | "complete" | "failed";

export interface VoiceCloneState {
  fileName: string | null;
  consent: boolean;
  status: VoiceCloneStatus;
  errorMessage: string | null;
  speakerId: string | null;
  raw: unknown;
}

export const INITIAL_VOICE_CLONE_STATE: VoiceCloneState = {
  fileName: null,
  consent: false,
  status: "idle",
  errorMessage: null,
  speakerId: null,
  raw: null,
};

export type VoiceCloneAction =
  | { type: "SET_FILE"; fileName: string }
  | { type: "SET_CONSENT"; consent: boolean }
  | { type: "START_ENCODING" }
  | { type: "START_UPLOADING" }
  | { type: "COMPLETE"; speakerId: string; raw: unknown }
  | { type: "ERROR"; message: string };

export function voiceCloneReducer(
  state: VoiceCloneState,
  action: VoiceCloneAction,
): VoiceCloneState {
  switch (action.type) {
    case "SET_FILE":
      return { ...state, fileName: action.fileName, status: "idle", errorMessage: null };
    case "SET_CONSENT":
      return { ...state, consent: action.consent };
    case "START_ENCODING":
      return { ...state, status: "encoding", errorMessage: null, speakerId: null, raw: null };
    case "START_UPLOADING":
      return { ...state, status: "uploading" };
    case "COMPLETE":
      return { ...state, status: "complete", speakerId: action.speakerId, raw: action.raw };
    case "ERROR":
      return { ...state, status: "failed", errorMessage: action.message };
    default:
      return state;
  }
}
