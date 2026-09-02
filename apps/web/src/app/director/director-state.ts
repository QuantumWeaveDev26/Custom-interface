import {
  composeShotPrompt,
  getCameraPreset,
  getLensPreset,
  type CameraPresetId,
  type LensPresetId,
  type LookPresetId,
} from "@creative-ai/prompt-library";

export interface DirectorShot {
  description: string;
  cameraPreset: CameraPresetId;
  cameraLabel: string;
  lensPreset: LensPresetId;
  lensLabel: string;
  durationSeconds: number;
  /** The description with the camera, lens and grade composed behind it. */
  prompt: string;
}

export type DirectorPhase = "idle" | "planning" | "planned" | "failed";

export interface DirectorState {
  brief: string;
  phase: DirectorPhase;
  shots: readonly DirectorShot[];
  /** The plan's single grade, shown once rather than repeated per shot. */
  lookLabel: string | null;
  /** The grade's id, needed to recompose a shot the user rewrites. */
  lookPreset: LookPresetId | null;
  errorMessage: string | null;
}

export const INITIAL_DIRECTOR_STATE: DirectorState = {
  brief: "",
  phase: "idle",
  shots: [],
  lookLabel: null,
  lookPreset: null,
  errorMessage: null,
};

export type DirectorAction =
  | { type: "SET_BRIEF"; brief: string }
  | { type: "PLAN_START" }
  | {
      type: "PLAN_SUCCESS";
      shots: readonly DirectorShot[];
      lookLabel: string;
      lookPreset: LookPresetId;
    }
  | { type: "EDIT_SHOT"; index: number; description: string }
  | {
      type: "EDIT_SHOT_CRAFT";
      index: number;
      cameraPreset?: CameraPresetId;
      lensPreset?: LensPresetId;
      durationSeconds?: number;
    }
  | { type: "PLAN_ERROR"; message: string };

export function directorReducer(
  state: DirectorState,
  action: DirectorAction,
): DirectorState {
  switch (action.type) {
    case "SET_BRIEF":
      return { ...state, brief: action.brief };
    case "PLAN_START":
      return {
        ...state,
        phase: "planning",
        errorMessage: null,
        shots: [],
        lookLabel: null,
        lookPreset: null,
      };
    case "PLAN_SUCCESS":
      return {
        ...state,
        phase: "planned",
        shots: action.shots,
        lookLabel: action.lookLabel,
        lookPreset: action.lookPreset,
        errorMessage: null,
      };
    case "EDIT_SHOT": {
      // The prompt is recomposed here, with the same function and the same
      // preset ids the server planned with. A rewritten description that left
      // `prompt` untouched would look edited and generate the original shot —
      // the worst possible outcome for a control whose whole purpose is to let
      // someone change what gets made.
      const shots = state.shots.map((shot, index) =>
        index !== action.index
          ? shot
          : {
              ...shot,
              description: action.description,
              prompt: composeShotPrompt({
                description: action.description,
                cameraPresetIds: [shot.cameraPreset],
                lensPresetId: shot.lensPreset,
                ...(state.lookPreset === null
                  ? {}
                  : { lookPresetId: state.lookPreset }),
              }),
            },
      );
      return { ...state, shots };
    }
    case "EDIT_SHOT_CRAFT": {
      // The lens and the move are the shot as much as the words are. Changing
      // one recomposes the prompt through the same function the server planned
      // with, so a lens picked here is a lens the model is actually told about
      // — a label that did not reach the prompt would be a decoration.
      const shots = state.shots.map((shot, index) => {
        if (index !== action.index) return shot;

        const cameraPreset = action.cameraPreset ?? shot.cameraPreset;
        const lensPreset = action.lensPreset ?? shot.lensPreset;
        return {
          ...shot,
          cameraPreset,
          lensPreset,
          cameraLabel: getCameraPreset(cameraPreset).label,
          lensLabel: getLensPreset(lensPreset).label,
          durationSeconds: action.durationSeconds ?? shot.durationSeconds,
          prompt: composeShotPrompt({
            description: shot.description,
            cameraPresetIds: [cameraPreset],
            lensPresetId: lensPreset,
            ...(state.lookPreset === null ? {} : { lookPresetId: state.lookPreset }),
          }),
        };
      });
      return { ...state, shots };
    }
    case "PLAN_ERROR":
      return {
        ...state,
        phase: "failed",
        errorMessage: action.message,
        shots: [],
        lookLabel: null,
        lookPreset: null,
      };
    default:
      return state;
  }
}
