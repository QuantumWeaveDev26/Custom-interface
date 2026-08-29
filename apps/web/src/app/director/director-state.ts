export interface DirectorShot {
  description: string;
  cameraPreset: string;
  cameraLabel: string;
  lensLabel: string;
  durationSeconds: number;
  prompt: string;
}

export type DirectorPhase = "idle" | "planning" | "planned" | "failed";

export interface DirectorState {
  brief: string;
  phase: DirectorPhase;
  shots: readonly DirectorShot[];
  /** The plan's single grade, shown once rather than repeated per shot. */
  lookLabel: string | null;
  errorMessage: string | null;
}

export const INITIAL_DIRECTOR_STATE: DirectorState = {
  brief: "",
  phase: "idle",
  shots: [],
  lookLabel: null,
  errorMessage: null,
};

export type DirectorAction =
  | { type: "SET_BRIEF"; brief: string }
  | { type: "PLAN_START" }
  | { type: "PLAN_SUCCESS"; shots: readonly DirectorShot[]; lookLabel: string }
  | { type: "PLAN_ERROR"; message: string };

export function directorReducer(
  state: DirectorState,
  action: DirectorAction,
): DirectorState {
  switch (action.type) {
    case "SET_BRIEF":
      return { ...state, brief: action.brief };
    case "PLAN_START":
      return { ...state, phase: "planning", errorMessage: null, shots: [], lookLabel: null };
    case "PLAN_SUCCESS":
      return {
        ...state,
        phase: "planned",
        shots: action.shots,
        lookLabel: action.lookLabel,
        errorMessage: null,
      };
    case "PLAN_ERROR":
      return { ...state, phase: "failed", errorMessage: action.message, shots: [], lookLabel: null };
    default:
      return state;
  }
}
