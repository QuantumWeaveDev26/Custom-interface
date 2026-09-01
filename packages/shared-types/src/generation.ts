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
/**
 * Polygon budget for a 3D mesh, passed as `--quality_override` (R5).
 *
 * The Model list documents a triangular mesh range of 500 to 1,000,000. Only
 * the top of that range appears in the provider's own sample, so the presets
 * below stay inside the documented bounds rather than inventing values — the
 * project has already shipped one setting ("1K" image size) that the provider
 * had never accepted.
 */
export const MODEL3D_QUALITY_PRESETS = Object.freeze({
  draft: 100_000,
  standard: 500_000,
  high: 1_000_000,
} as const);

export type Model3dQuality = keyof typeof MODEL3D_QUALITY_PRESETS;

export const MODEL3D_QUALITIES: readonly Model3dQuality[] = Object.freeze([
  "draft",
  "standard",
  "high",
] as const);

export type GenerationParams =
  | { type: "image"; size: ImageSize; count: number }
  | {
      type: "video";
      resolution: VideoResolution;
      ratio: VideoRatio;
      durationSeconds: number;
      /**
       * Whether the model returns a soundtrack with the pictures.
       *
       * On by default, because that is what the provider already does. Verified
       * live on 2026-09-01: a clip generated before this field existed carries
       * an AAC track at mean -28 dB — real sound, not a silent stream — and the
       * request never mentioned audio. Defaulting this to false would have
       * turned off a feature the product already shipped with.
       *
       * The chip therefore turns sound *off*, for a take that does not want it.
       */
      withAudio: boolean;
      /**
       * How many clips to chain into one continuous piece.
       *
       * 1 is an ordinary take. Above 1, each round extends the previous clip
       * through the provider's video-extend path, so the continuation is
       * conditioned on the clip's motion rather than on a single still — which
       * is what makes minutes of footage hold together.
       *
       * Sequential by nature: round N+1 cannot start until round N exists. At
       * roughly three minutes a round, the ceiling is as much about wall clock
       * as it is about spend.
       */
      rounds: number;
      /**
       * What happens in each clip, one entry per round.
       *
       * Optional, and absent means every round reuses the job's single prompt —
       * which produces one continuous motion rather than a story. With it, round
       * N is directed by entry N while still extending the clip round N-1
       * produced, so the piece stays visually continuous while the action moves
       * on. Length must equal `rounds`; a shot list that disagrees with the
       * clip count silently drops or repeats a shot.
       */
      shotPrompts?: readonly string[];
    }
  | { type: "voice"; style: VoiceStyle }
  | { type: "model3d"; quality: Model3dQuality };

/**
 * The longest chain a single job may ask for.
 *
 * Sixteen 30s rounds is eight minutes, which is the length this ceiling was
 * chosen to reach. It is a wall-clock limit as much as a spend one: at ~3
 * minutes a round, sixteen rounds is most of an hour with no way to parallelise,
 * because each round needs the clip before it.
 */
export const MAX_CHAIN_ROUNDS = 16;

// --- Model capabilities -----------------------------------------------------

export interface VideoModelCapabilities {
  readonly resolutions: readonly VideoResolution[];
  readonly minDurationSeconds: number;
  readonly maxDurationSeconds: number;
  /**
   * What a second of 720p costs on this model.
   *
   * It lives here, beside the capabilities, because model and price have to
   * move together — ARCHITECTURE.md §8 records that keeping them in separate
   * places is how a model swap silently mis-bills. Keeping them in one record
   * makes that mistake impossible rather than merely discouraged.
   */
  readonly creditsPerSecond720p: number;
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
    // $3.46 for 15s at 720p (confirmed console capture) / $0.04 a credit / 15s.
    creditsPerSecond720p: 5.77,
  }),
  "dreamina-seedance-2-0-260128": Object.freeze({
    resolutions: Object.freeze(["480p", "720p", "1080p", "4K"] as const),
    minDurationSeconds: 4,
    maxDurationSeconds: 15,
    // ⚠️ UNCONFIRMED. No published per-second price for 2.0-standard was found.
    // Set equal to 2.5's rate as the least-bad placeholder: 2.0 is the older
    // model and is unlikely to cost more per second, so this errs toward
    // over-charging rather than under-charging against real spend. Confirm
    // before this model carries meaningful volume.
    creditsPerSecond720p: 5.77,
  }),
  "dreamina-seedance-2-0-fast-260128": Object.freeze({
    resolutions: Object.freeze(["480p", "720p"] as const),
    minDurationSeconds: 4,
    maxDurationSeconds: 15,
    // ~$0.54 for 5s at 720p / $0.04 a credit / 5s = 2.7; held at the historical
    // 2.8 this project shipped with.
    creditsPerSecond720p: 2.8,
  }),
  "dreamina-seedance-2-0-mini-260615": Object.freeze({
    resolutions: Object.freeze(["480p", "720p"] as const),
    minDurationSeconds: 4,
    maxDurationSeconds: 15,
    // ~$0.54 for 5s at 720p / $0.04 a credit / 5s = 2.7; held at the historical
    // 2.8 this project shipped with.
    creditsPerSecond720p: 2.8,
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
    // An unknown model is priced at the dearest rate we know of, so a mistake
    // here overcharges us rather than the user.
    creditsPerSecond720p: 5.77,
  });

export function videoCapabilitiesFor(model: string): VideoModelCapabilities {
  return VIDEO_MODEL_CAPABILITIES[model] ?? CONSERVATIVE_VIDEO_CAPABILITIES;
}

/**
 * Which model can actually deliver a requested resolution.
 *
 * No single model does both 4K and 30 seconds: Seedance 2.5 reaches 30s but
 * stops at 1080p, and Seedance 2.0 reaches 4K but stops at 15s. Rather than
 * making the user learn that, the resolution they pick chooses the model, and
 * the duration ceiling follows from it.
 *
 * Given a list of candidates, the first one that supports the resolution wins,
 * so callers express preference by ordering — put the longer-duration model
 * first and 4K falls through to the only model that can do it.
 */
/** What a resolution costs the user in reach: which model, and how long. */
export interface VideoResolutionLimit {
  readonly model: string;
  readonly minDurationSeconds: number;
  readonly maxDurationSeconds: number;
}

export type VideoResolutionLimits = Partial<
  Record<VideoResolution, VideoResolutionLimit>
>;

export function videoModelForResolution(
  resolution: VideoResolution,
  candidates: readonly string[],
): string | null {
  for (const model of candidates) {
    if (videoCapabilitiesFor(model).resolutions.includes(resolution)) {
      return model;
    }
  }
  return null;
}

// --- Defaults ---------------------------------------------------------------

// These reproduce the previous hardcoded profiles exactly, so a request that
// omits parameters behaves identically to before this file existed.
export const DEFAULT_IMAGE_PARAMS: Extract<GenerationParams, { type: "image" }> =
  Object.freeze({ type: "image", size: "4K", count: 1 });

export const DEFAULT_MODEL3D_PARAMS: Extract<GenerationParams, { type: "model3d" }> =
  Object.freeze({ type: "model3d", quality: "standard" });

export const DEFAULT_VIDEO_PARAMS: Extract<GenerationParams, { type: "video" }> =
  Object.freeze({
    type: "video",
    resolution: "720p",
    ratio: "21:9",
    durationSeconds: 5,
    withAudio: true,
    rounds: 1,
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

// Anchored on ARCHITECTURE.md §8: 1 credit ~= $0.04 of real BytePlus spend.
//
// Derivation for the current default model, dreamina-seedance-2-5-260628:
//   $3.46 for 15s at 720p 16:9   (console capture, MODELARK_API_REFERENCE.md
//                                 § "Confirmed available models")
//   $3.46 / $0.04 = 86.5 credits for 15s
//   86.5 / 15s    = 5.77 credits per second at 720p
//
// This number is coupled to MODELARK_VIDEO_MODEL. Changing one without the
// other silently mis-bills against real spend — see ARCHITECTURE.md §8. The
// previous value was 2.8, derived the same way for seedance-2-0-fast at
// ~$0.54 a clip; 2.5 costs roughly twice as much per second.
export const DEFAULT_VIDEO_CREDITS_PER_SECOND_720P = 5.77;

// ⚠️ UNCONFIRMED. Pixel-count-derived, then rounded UP at every step, because
// under-charging costs real money and over-charging only costs goodwill.
// 480p is ~0.34x of 720p by pixels and is billed at 0.5x here on purpose.
// Verify against real BytePlus per-resolution pricing before launch.
// ⚠️ The 4K entry is UNCONFIRMED — derived from the pixel-count ratio
// (3840x2160 / 1280x720 = 9), never checked against real BytePlus per-resolution
// pricing. It is currently unreachable: the default model tops out at 1080p, so
// nothing can select 4K. Confirm it before ever defaulting to a 4K-capable
// model such as dreamina-seedance-2-0-260128.
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
  /**
   * Fallback rate, used only for a resolution no configured model claims.
   * Real pricing comes from the model the resolution routes to.
   */
  videoCreditsPerSecond720p: number;
  /**
   * Video models this deployment may use, in preference order. The first one
   * that supports a requested resolution serves it, so ordering decides
   * whether 1080p is served by the long model or the 4K one.
   */
  videoModels: readonly string[];
  /** Base rate for a 3D mesh; scaled by the polygon budget. */
  model3dCredits: number;
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
  if (params.type === "model3d") {
    // Scaled off the polygon budget, since that is what drives provider spend.
    // "standard" is the reference point, so it costs exactly model3dCredits.
    const budget = MODEL3D_QUALITY_PRESETS[params.quality];
    const multiplier = budget / MODEL3D_QUALITY_PRESETS.standard;
    return Math.max(1, Math.ceil(pricing.model3dCredits * multiplier));
  }

  // The rate comes from whichever model will actually serve this resolution,
  // not from a single global figure — 4K routes to a different model than 30s
  // does, and each carries its own price. `pricing.videoCreditsPerSecond720p`
  // remains the fallback for a resolution no known model claims.
  const model = videoModelForResolution(params.resolution, pricing.videoModels);
  const perSecond =
    model === null
      ? pricing.videoCreditsPerSecond720p
      : videoCapabilitiesFor(model).creditsPerSecond720p;

  const multiplier = RESOLUTION_COST_MULTIPLIER[params.resolution];
  // Every round is a full generation of its own — the provider charges for the
  // new footage each time, so a 16-round chain costs sixteen clips, not one.
  const raw = perSecond * params.durationSeconds * multiplier * params.rounds;
  return Math.max(1, Math.ceil(raw));
}
