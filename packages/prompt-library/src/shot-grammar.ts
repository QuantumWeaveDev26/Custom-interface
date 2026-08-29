// Cinema controls beyond camera movement.
//
// Higgsfield separates a shot into independent axes the user combines: how the
// camera moves, what glass it is shot through, and how the result is graded.
// Movement lives in camera-presets.ts; the other two axes live here, and
// composeShotPrompt stacks all three onto the user's own description.
//
// These are prompt fragments, not API parameters. Seedance has no aperture
// field -- the words do the work, so they are written the way a shot would be
// described on a call sheet rather than as a list of adjectives.

import { getCameraPreset, type CameraPresetId } from "./camera-presets.js";

export type LensPresetId =
  | "ultra-wide"
  | "wide"
  | "standard"
  | "portrait"
  | "telephoto"
  | "macro"
  | "anamorphic"
  | "fisheye";

export interface LensPreset {
  id: LensPresetId;
  label: string;
  description: string;
  promptFragment: string;
}

export const LENS_PRESETS: readonly LensPreset[] = Object.freeze([
  {
    id: "ultra-wide",
    label: "Ultra Wide 14mm",
    description: "Sweeping field of view with exaggerated depth.",
    promptFragment: "shot on a 14mm ultra-wide lens, sweeping field of view, exaggerated depth and perspective",
  },
  {
    id: "wide",
    label: "Wide 24mm",
    description: "Environmental framing that keeps context in shot.",
    promptFragment: "shot on a 24mm wide lens, environmental framing that keeps the surroundings in view",
  },
  {
    id: "standard",
    label: "Standard 50mm",
    description: "Natural perspective close to human vision.",
    promptFragment: "shot on a 50mm lens, natural perspective close to human vision",
  },
  {
    id: "portrait",
    label: "Portrait 85mm f/1.4",
    description: "Flattering compression with a shallow, creamy background.",
    promptFragment: "shot on an 85mm lens at f/1.4, shallow depth of field, creamy bokeh, background falling softly out of focus",
  },
  {
    id: "telephoto",
    label: "Telephoto 200mm",
    description: "Heavy compression that flattens distance.",
    promptFragment: "shot on a 200mm telephoto lens, heavily compressed perspective flattening the distance between planes",
  },
  {
    id: "macro",
    label: "Macro 100mm",
    description: "Extreme detail with a razor-thin focal plane.",
    promptFragment: "shot on a 100mm macro lens, extreme fine detail, razor-thin plane of focus",
  },
  {
    id: "anamorphic",
    label: "Anamorphic",
    description: "Widescreen character with oval bokeh and blue flares.",
    promptFragment: "anamorphic lens, oval bokeh, horizontal blue lens flares, cinematic widescreen character",
  },
  {
    id: "fisheye",
    label: "Fisheye 8mm",
    description: "Extreme barrel distortion, curved horizon.",
    promptFragment: "shot on an 8mm fisheye lens, extreme barrel distortion, strongly curved horizon",
  },
]);

export type LookPresetId =
  | "cinematic"
  | "film-noir"
  | "golden-hour"
  | "blue-hour"
  | "neon-night"
  | "vintage-film"
  | "documentary"
  | "high-key"
  | "low-key"
  | "desaturated";

export interface LookPreset {
  id: LookPresetId;
  label: string;
  description: string;
  promptFragment: string;
}

export const LOOK_PRESETS: readonly LookPreset[] = Object.freeze([
  {
    id: "cinematic",
    label: "Cinematic",
    description: "Modern feature-film grade with rich contrast.",
    promptFragment: "cinematic colour grade, rich contrast, filmic highlight roll-off",
  },
  {
    id: "film-noir",
    label: "Film Noir",
    description: "Hard shadows, venetian light, deep blacks.",
    promptFragment: "film noir lighting, hard directional key, deep crushed blacks, slatted shadows across the frame",
  },
  {
    id: "golden-hour",
    label: "Golden Hour",
    description: "Low warm sun, long shadows, hazy backlight.",
    promptFragment: "golden hour light, low warm sun, long shadows, hazy golden backlight",
  },
  {
    id: "blue-hour",
    label: "Blue Hour",
    description: "Cool twilight just after sunset.",
    promptFragment: "blue hour twilight, cool ambient light just after sunset, soft even shadows",
  },
  {
    id: "neon-night",
    label: "Neon Night",
    description: "Wet streets lit by saturated signage.",
    promptFragment: "neon-lit night, saturated magenta and cyan signage reflecting off wet surfaces",
  },
  {
    id: "vintage-film",
    label: "Vintage Film",
    description: "Grainy stock with faded colour.",
    promptFragment: "vintage 16mm film stock, visible grain, faded halation, slightly washed colour",
  },
  {
    id: "documentary",
    label: "Documentary",
    description: "Available light, honest and unstyled.",
    promptFragment: "documentary look, available light only, natural unstyled colour",
  },
  {
    id: "high-key",
    label: "High Key",
    description: "Bright, airy, minimal shadow.",
    promptFragment: "high-key lighting, bright and airy, minimal shadow, soft even fill",
  },
  {
    id: "low-key",
    label: "Low Key",
    description: "Mostly darkness with a single light source.",
    promptFragment: "low-key lighting, predominantly dark frame lit by a single source, dramatic falloff",
  },
  {
    id: "desaturated",
    label: "Desaturated",
    description: "Muted, near-monochrome palette.",
    promptFragment: "desaturated muted palette, near-monochrome with restrained colour",
  },
]);

const LENS_BY_ID: ReadonlyMap<LensPresetId, LensPreset> = new Map(
  LENS_PRESETS.map((preset) => [preset.id, preset]),
);

const LOOK_BY_ID: ReadonlyMap<LookPresetId, LookPreset> = new Map(
  LOOK_PRESETS.map((preset) => [preset.id, preset]),
);

export function getLensPreset(id: LensPresetId): LensPreset {
  const preset = LENS_BY_ID.get(id);
  if (!preset) {
    throw new Error(`Unknown lens preset: ${id}`);
  }
  return preset;
}

export function getLookPreset(id: LookPresetId): LookPreset {
  const preset = LOOK_BY_ID.get(id);
  if (!preset) {
    throw new Error(`Unknown look preset: ${id}`);
  }
  return preset;
}

export function isLensPresetId(value: string): value is LensPresetId {
  return LENS_BY_ID.has(value as LensPresetId);
}

export function isLookPresetId(value: string): value is LookPresetId {
  return LOOK_BY_ID.has(value as LookPresetId);
}

export interface ShotSpec {
  /** What the user actually wants to see. Always leads the prompt. */
  description: string;
  /** Zero or more camera moves, applied in the given order. */
  cameraPresetIds?: readonly CameraPresetId[];
  lensPresetId?: LensPresetId;
  lookPresetId?: LookPresetId;
}

/**
 * Stacks the selected presets onto the user's description.
 *
 * The description leads because the model weights early tokens most heavily;
 * style fragments trailing it read as direction rather than as subject. Camera
 * moves keep their selection order, so "dolly in, then tilt up" stays a
 * sequence instead of becoming an unordered pile of adjectives.
 *
 * Duplicate moves are collapsed — selecting the same move twice is a UI
 * accident, and repeating a fragment only dilutes the rest of the prompt.
 */
export function composeShotPrompt(spec: ShotSpec): string {
  const description = spec.description.trim();

  const seen = new Set<CameraPresetId>();
  const fragments: string[] = [];

  for (const id of spec.cameraPresetIds ?? []) {
    if (seen.has(id)) continue;
    seen.add(id);
    fragments.push(getCameraPreset(id).promptFragment);
  }

  if (spec.lensPresetId !== undefined) {
    fragments.push(getLensPreset(spec.lensPresetId).promptFragment);
  }
  if (spec.lookPresetId !== undefined) {
    fragments.push(getLookPreset(spec.lookPresetId).promptFragment);
  }

  if (fragments.length === 0) return description;
  if (description.length === 0) return fragments.join(", ");
  return `${description}, ${fragments.join(", ")}`;
}
