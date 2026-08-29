export {
  CAMERA_PRESETS,
  getCameraPreset,
  isCameraPresetId,
} from "./camera-presets.js";
export type { CameraPreset, CameraPresetId } from "./camera-presets.js";

export {
  LENS_PRESETS,
  LOOK_PRESETS,
  composeShotPrompt,
  getLensPreset,
  getLookPreset,
  isLensPresetId,
  isLookPresetId,
} from "./shot-grammar.js";
export type {
  LensPreset,
  LensPresetId,
  LookPreset,
  LookPresetId,
  ShotSpec,
} from "./shot-grammar.js";
