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
  | "orbit"
  | "crane-up"
  | "crane-down"
  | "tilt-up"
  | "tilt-down"
  | "zoom-in"
  | "zoom-out"
  | "crash-zoom"
  | "dutch-angle"
  | "whip-pan"
  | "arc-left"
  | "arc-right"
  | "follow-behind"
  | "fpv-drone"
  | "pull-back-reveal"
  | "birds-eye"
  | "worms-eye"
  | "over-the-shoulder"
  | "extreme-close-up"
  | "wide-establishing"
  | "rack-focus";

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
  {
    id: "crane-up",
    label: "Crane Up",
    description: "Camera rises vertically while staying on the subject.",
    promptFragment: "crane shot rising vertically, camera lifting up and away while holding the subject in frame",
  },
  {
    id: "crane-down",
    label: "Crane Down",
    description: "Camera descends vertically onto the subject.",
    promptFragment: "crane shot descending vertically, camera lowering toward the subject",
  },
  {
    id: "tilt-up",
    label: "Tilt Up",
    description: "Camera pivots upward from a fixed position.",
    promptFragment: "vertical tilt upward, camera pivoting up on a fixed position",
  },
  {
    id: "tilt-down",
    label: "Tilt Down",
    description: "Camera pivots downward from a fixed position.",
    promptFragment: "vertical tilt downward, camera pivoting down on a fixed position",
  },
  {
    id: "zoom-in",
    label: "Zoom In",
    description: "Lens zooms in without the camera moving.",
    promptFragment: "slow optical zoom in, lens tightening while the camera stays put",
  },
  {
    id: "zoom-out",
    label: "Zoom Out",
    description: "Lens zooms out without the camera moving.",
    promptFragment: "slow optical zoom out, lens widening while the camera stays put",
  },
  {
    id: "crash-zoom",
    label: "Crash Zoom",
    description: "Abrupt snap zoom onto the subject.",
    promptFragment: "abrupt crash zoom snapping in on the subject, sudden and aggressive",
  },
  {
    id: "dutch-angle",
    label: "Dutch Angle",
    description: "Camera tilted off-axis for unease.",
    promptFragment: "dutch angle, camera canted off its horizontal axis, unsettling framing",
  },
  {
    id: "whip-pan",
    label: "Whip Pan",
    description: "Fast blurred pan, often used as a transition.",
    promptFragment: "fast whip pan, motion blur streaking across the frame",
  },
  {
    id: "arc-left",
    label: "Arc Left",
    description: "Camera curves left around the subject.",
    promptFragment: "camera arcing left around the subject in a curved path",
  },
  {
    id: "arc-right",
    label: "Arc Right",
    description: "Camera curves right around the subject.",
    promptFragment: "camera arcing right around the subject in a curved path",
  },
  {
    id: "follow-behind",
    label: "Follow Behind",
    description: "Camera trails the subject from behind.",
    promptFragment: "camera following close behind the subject, third-person trailing shot",
  },
  {
    id: "fpv-drone",
    label: "FPV Drone",
    description: "Fast first-person drone flight through the scene.",
    promptFragment: "fast FPV drone flight weaving through the scene, first-person aerial perspective",
  },
  {
    id: "pull-back-reveal",
    label: "Pull-Back Reveal",
    description: "Camera retreats to expose a wider context.",
    promptFragment: "pull-back reveal, camera retreating to expose the wider surroundings",
  },
  {
    id: "birds-eye",
    label: "Bird's Eye",
    description: "Straight down from directly overhead.",
    promptFragment: "bird's eye view looking straight down from directly overhead, top-down framing",
  },
  {
    id: "worms-eye",
    label: "Worm's Eye",
    description: "From ground level looking steeply up.",
    promptFragment: "worm's eye view from ground level looking steeply upward",
  },
  {
    id: "over-the-shoulder",
    label: "Over the Shoulder",
    description: "Framed past a foreground shoulder onto the subject.",
    promptFragment: "over-the-shoulder framing, foreground shoulder soft in frame, subject beyond",
  },
  {
    id: "extreme-close-up",
    label: "Extreme Close-Up",
    description: "Macro framing on a single detail.",
    promptFragment: "extreme close-up, macro framing filling the frame with a single detail",
  },
  {
    id: "wide-establishing",
    label: "Wide Establishing",
    description: "Wide shot placing the subject in its setting.",
    promptFragment: "wide establishing shot, subject small within an expansive setting",
  },
  {
    id: "rack-focus",
    label: "Rack Focus",
    description: "Focus shifts between foreground and background.",
    promptFragment: "rack focus, focal plane shifting from foreground to background mid-shot",
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
