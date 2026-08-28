export type TranscribePhase =
  | "idle"
  | "encoding"
  | "uploading"
  | "processing"
  | "complete"
  | "no_speech"
  | "failed";

export interface TranscribeState {
  fileName: string | null;
  phase: TranscribePhase;
  errorMessage: string | null;
  text: string | null;
}

export const INITIAL_TRANSCRIBE_STATE: TranscribeState = {
  fileName: null,
  phase: "idle",
  errorMessage: null,
  text: null,
};

export type TranscribeAction =
  | { type: "SET_FILE"; fileName: string }
  | { type: "START_ENCODING" }
  | { type: "START_UPLOADING" }
  | { type: "START_PROCESSING" }
  | { type: "COMPLETE"; text: string }
  | { type: "NO_SPEECH" }
  | { type: "ERROR"; message: string };

export function transcribeReducer(
  state: TranscribeState,
  action: TranscribeAction,
): TranscribeState {
  switch (action.type) {
    case "SET_FILE":
      return {
        ...INITIAL_TRANSCRIBE_STATE,
        fileName: action.fileName,
      };
    case "START_ENCODING":
      return { ...state, phase: "encoding", errorMessage: null, text: null };
    case "START_UPLOADING":
      return { ...state, phase: "uploading" };
    case "START_PROCESSING":
      return { ...state, phase: "processing" };
    case "COMPLETE":
      return { ...state, phase: "complete", text: action.text };
    case "NO_SPEECH":
      return { ...state, phase: "no_speech", text: "" };
    case "ERROR":
      return { ...state, phase: "failed", errorMessage: action.message };
    default:
      return state;
  }
}
