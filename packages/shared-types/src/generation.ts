// Generation parameters, model capabilities, and credit pricing.
//
// Replaces the frozen IMAGE_PROFILE / VIDEO_PROFILE constants, which hardcoded
// every job to one output shape (5s / 720p / 21:9 video). Seedance and Seedream
// support a far wider range -- see CAPABILITY_MAP.md -- and exposing that range
// requires parameters to travel with the job rather than being compiled in.
//
// Two invariants this file exists to protect:
//   1. Parameters are validated server-side against the *model's* real limits.
//      A client can ask for anything; only what the configured model documents
//      as supported is accepted.
//   2. Credit cost is derived from those parameters, never a flat constant. A
//      30s 1080p clip is not a 5s 720p clip, and charging one price for both
//      loses real money against real BytePlus spend.

export type VideoResolution = "480p" | "720p" | "1080p" | "4K";
// Confirmed from BytePlus docs 2026-08-28 (R2). "3:4" was missing before —
// a real gap, since it is a common portrait format. "adaptive" means "match the
// source image's ratio" and is documented only for image-driven generation, so
// callers must not offer it for text-to-video.
export type VideoRatio =
  | "16:9"
  | "9:16"
  | "1:1"
  | "4:3"
  | "3:4"
  | "21:9"
  | "adaptive";
// Confirmed live 2026-08-29: the provider rejects "1K" outright —
// "size must be one of 'WIDTHxHEIGHT', '2k', '3k', or '4k'". 3K exists and was
// never offered; 1K was offered and never worked.
export type ImageSize = "2K" | "3K" | "4K";
export type VoiceStyle = "standard" | "expressive";

export const VIDEO_RESOLUTIONS: readonly VideoResolution[] = Object.freeze([
  "480p",
  "720p",
  "1080p",
  "4K",
] as const);

export const VIDEO_RATIOS: readonly VideoRatio[] = Object.freeze([
  "16:9",
  "9:16",
  "1:1",
  "4:3",
  "3:4",
  "21:9",
  "adaptive",
] as const);

/**
 * "adaptive" derives the output ratio from an input image, so it is only
 * meaningful when the job carries one. Text-to-video has nothing to adapt to.
 */
export function ratioRequiresInputImage(ratio: VideoRatio): boolean {
  return ratio === "adaptive";
}

export const IMAGE_SIZES: readonly ImageSize[] = Object.freeze([
  "2K",
  "3K",
  "4K",
] as const);

/** Discriminated by job type so every branch is exhaustively checkable. */
export type GenerationParams =
  | { type: "image"; size: ImageSize; count: number }
  | {
      type: "video";
      resolution: VideoResolution;
      ratio: VideoRatio;
      durationSeconds: number;
    }
  | { type: "voice"; style: VoiceStyle };

// --- Model capabilities -----------------------------------------------------

export interface VideoModelCapabilities {
  readonly resolutions: readonly VideoResolution[];
  readonly minDurationSeconds: number;
  readonly maxDurationSeconds: number;
}

// Sourced from BytePlus's published model list (docs.byteplus.com ModelArk
// "Model list"), 2026-08-28. DOCUMENTED, NOT LIVE-TESTED -- per this project's
// standing rule, BytePlus docs have differed from real behavior before. Confirm
// with a real call before relying on a range we have not exercised.
export const VIDEO_MODEL_CAPABILITIES: Readonly<
  Record<string, VideoModelCapabilities>
> = Object.freeze({
  "dreamina-seedance-2-5-260628": Object.freeze({
    resolutions: Object.freeze(["480p", "720p", "1080p"] as const),
    minDurationSeconds: 4,
    maxDurationSeconds: 30,
  }),
  "dreamina-seedance-2-0-260128": Object.freeze({
    resolutions: Object.freeze(["480p", "720p", "1080p", "4K"] as const),
    minDurationSeconds: 4,
    maxDurationSeconds: 15,
  }),
  "dreamina-seedance-2-0-fast-260128": Object.freeze({
    resolutions: Object.freeze(["480p", "720p"] as const),
    minDurationSeconds: 4,
    maxDurationSeconds: 15,
  }),
  "dreamina-seedance-2-0-mini-260615": Object.freeze({
    resolutions: Object.freeze(["480p", "720p"] as const),
    minDurationSeconds: 4,
    maxDurationSeconds: 15,
  }),
});

// Used when the configured model is not in the registry above. Deliberately the
// narrowest useful range: an unknown model must never let a request through that
// the provider would reject (or bill more for) than we validated against.
export const CONSERVATIVE_VIDEO_CAPABILITIES: VideoModelCapabilities =
  Object.freeze({
    resolutions: Object.freeze(["480p", "720p"] as const),
    minDurationSeconds: 4,
    maxDurationSeconds: 5,
  });

export function videoCapabilitiesFor(model: string): VideoModelCapabilities {
  return VIDEO_MODEL_CAPABILITIES[model] ?? CONSERVATIVE_VIDEO_CAPABILITIES;
}

// --- Defaults ---------------------------------------------------------------

// These reproduce the previous hardcoded profiles exactly, so a request that
// omits parameters behaves identically to before this file existed.
export const DEFAULT_IMAGE_PARAMS: Extract<GenerationParams, { type: "image" }> =
  Object.freeze({ type: "image", size: "4K", count: 1 });

export const DEFAULT_VIDEO_PARAMS: Extract<GenerationParams, { type: "video" }> =
  Object.freeze({
    type: "video",
    resolution: "720p",
    ratio: "21:9",
    durationSeconds: 5,
  });

export const DEFAULT_VOICE_PARAMS: Extract<GenerationParams, { type: "voice" }> =
  Object.freeze({ type: "voice", style: "standard" });

// --- Input assets -----------------------------------------------------------

// A job can consume assets the user already owns. Roles map to the Seedance /
// Seedream modes in CAPABILITY_MAP.md §2:
//   first_frame / last_frame -> image-to-video, keyframe control
//   reference                -> reference-to-video, multi-reference image-to-image
//   source_video             -> video extension, video editing
export type InputAssetRole =
  | "first_frame"
  | "last_frame"
  | "reference"
  | "source_video";

export const INPUT_ASSET_ROLES: readonly InputAssetRole[] = Object.freeze([
  "first_frame",
  "last_frame",
  "reference",
  "source_video",
] as const);

export interface JobInputAssetRef {
  assetId: string;
  role: InputAssetRole;
}

// Multi-reference image-to-image is the primitive behind character consistency
// (the Soul ID equivalent). Cap kept deliberately low until R3 confirms what
// Seedream actually accepts.
export const MAX_INPUT_ASSETS_PER_JOB = 8;

// Seedream batches up to 15 images per request, but the ceiling is shared with
// the input references: references + generated <= 15 (R9). So three references
// leave room for twelve, not fifteen.
export const MAX_BATCH_IMAGES = 15;

// Extend video stitches 1-3 clips into one continuous shot; the Seedance 2.0
// series documents 3 as the per-request ceiling (R4). Seedance 2.5 allows 10 --
// raise this alongside a model upgrade, not before.
export const MAX_SOURCE_VIDEOS_PER_JOB = 3;

// --- Credit pricing ---------------------------------------------------------

// Anchored on ARCHITECTURE.md §8: 1 credit ~= $0.04 of real BytePlus spend, and
// seedance-2-0-fast at 5s/720p cost 14 credits. 2.8 x 5s x 1.0 = 14, so the
// previous fixed price is preserved exactly for the previous fixed profile.
export const DEFAULT_VIDEO_CREDITS_PER_SECOND_720P = 2.8;

// ⚠️ UNCONFIRMED. Pixel-count-derived, then rounded UP at every step, because
// under-charging costs real money and over-charging only costs goodwill.
// 480p is ~0.34x of 720p by pixels and is billed at 0.5x here on purpose.
// Verify against real BytePlus per-resolution pricing before launch.
export const RESOLUTION_COST_MULTIPLIER: Readonly<
  Record<VideoResolution, number>
> = Object.freeze({
  "480p": 0.5,
  "720p": 1,
  "1080p": 2.25,
  "4K": 9,
});

export interface CreditPricing {
  /** Flat per-image cost. Seedream is not known to price by size. */
  imageCredits: number;
  /** Flat per-request cost. Real Seed Speech per-request pricing unconfirmed. */
  voiceCredits: number;
  /** Reference rate; scaled by duration and resolution. */
  videoCreditsPerSecond720p: number;
}

/**
 * Credits to charge for one generation.
 *
 * Always rounds up to a whole credit — a fractional charge cannot be stored in
 * the integer ledger, and rounding down would let short/small jobs bill zero.
 */
export function creditCostFor(
  params: GenerationParams,
  pricing: CreditPricing,
): number {
  if (params.type === "image") {
    // A batch is billed per image, because that is how the provider bills it.
    // The model may return fewer than requested; the shortfall is credited back
    // at completion rather than being priced in here.
    return Math.max(1, Math.ceil(pricing.imageCredits * params.count));
  }
  if (params.type === "voice") {
    return Math.max(1, Math.ceil(pricing.voiceCredits));
  }

  const multiplier = RESOLUTION_COST_MULTIPLIER[params.resolution];
  const raw =
    pricing.videoCreditsPerSecond720p * params.durationSeconds * multiplier;
  return Math.max(1, Math.ceil(raw));
}
