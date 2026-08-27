export type CameraPresetId =
  | "static"
  | "dolly-in"
  | "dolly-out"
  | "pan-left"
  | "pan-right"
  | "tracking"
  | "aerial"
  | "low-angle"
  | "close-up"
  | "handheld"
  | "orbit";

export interface CameraPreset {
  id: CameraPresetId;
  label: string;
  description: string;
  promptFragment: string;
}

export const CAMERA_PRESETS: readonly CameraPreset[] = Object.freeze([
  {
    id: "static",
    label: "Static",
    description: "Locked-off camera, no movement.",
    promptFragment: "static locked-off camera shot, no camera movement",
  },
  {
    id: "dolly-in",
    label: "Dolly In",
    description: "Camera moves smoothly toward the subject.",
    promptFragment: "slow cinematic dolly-in shot, camera moving smoothly toward the subject",
  },
  {
    id: "dolly-out",
    label: "Dolly Out",
    description: "Camera moves smoothly away from the subject.",
    promptFragment: "slow cinematic dolly-out shot, camera pulling back away from the subject",
  },
  {
    id: "pan-left",
    label: "Pan Left",
    description: "Camera rotates horizontally to the left.",
    promptFragment: "smooth horizontal pan to the left, camera pivoting on its axis",
  },
  {
    id: "pan-right",
    label: "Pan Right",
    description: "Camera rotates horizontally to the right.",
    promptFragment: "smooth horizontal pan to the right, camera pivoting on its axis",
  },
  {
    id: "tracking",
    label: "Tracking Shot",
    description: "Camera follows the subject laterally as it moves.",
    promptFragment: "cinematic tracking shot, camera moving laterally alongside the subject",
  },
  {
    id: "aerial",
    label: "Aerial / Drone",
    description: "High overhead establishing shot.",
    promptFragment: "sweeping aerial drone shot, high overhead establishing view",
  },
  {
    id: "low-angle",
    label: "Low Angle",
    description: "Camera looks up at the subject for a powerful, dramatic feel.",
    promptFragment: "dramatic low-angle shot, camera looking up at the subject",
  },
  {
    id: "close-up",
    label: "Close-Up",
    description: "Tight framing on the subject or detail.",
    promptFragment: "intimate close-up shot, tight framing on the subject",
  },
  {
    id: "handheld",
    label: "Handheld",
    description: "Slightly shaky, documentary-style camera movement.",
    promptFragment: "handheld camera movement, subtle natural shake, documentary style",
  },
  {
    id: "orbit",
    label: "Orbit",
    description: "Camera arcs around the subject in a circular path.",
    promptFragment: "cinematic orbit shot, camera arcing smoothly around the subject",
  },
]);

const CAMERA_PRESET_BY_ID: ReadonlyMap<CameraPresetId, CameraPreset> = new Map(
  CAMERA_PRESETS.map((preset) => [preset.id, preset]),
);

export function getCameraPreset(id: CameraPresetId): CameraPreset {
  const preset = CAMERA_PRESET_BY_ID.get(id);
  if (!preset) {
    throw new Error(`Unknown camera preset: ${id}`);
  }
  return preset;
}

export function isCameraPresetId(value: string): value is CameraPresetId {
  return CAMERA_PRESET_BY_ID.has(value as CameraPresetId);
}
