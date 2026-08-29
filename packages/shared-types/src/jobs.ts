import {
  DEFAULT_IMAGE_PARAMS,
  DEFAULT_VIDEO_PARAMS,
  DEFAULT_VOICE_PARAMS,
  IMAGE_SIZES,
  INPUT_ASSET_ROLES,
  MAX_BATCH_IMAGES,
  MAX_INPUT_ASSETS_PER_JOB,
  MAX_SOURCE_VIDEOS_PER_JOB,
  VIDEO_RATIOS,
  VIDEO_RESOLUTIONS,
  ratioRequiresInputImage,
  videoCapabilitiesFor,
  type GenerationParams,
  type ImageSize,
  type InputAssetRole,
  type JobInputAssetRef,
  type VideoRatio,
  type VideoResolution,
  type VoiceStyle,
} from "./generation.js";

export type JobType = "image" | "video" | "voice";

export type SubmitJobRequest = {
  type: JobType;
  prompt: string;
  /** Always populated after parsing — omitted client fields fall back to defaults. */
  params: GenerationParams;
  /** Possibly empty. Ownership is checked at submission, not here. */
  inputAssets: readonly JobInputAssetRef[];
};

export class InvalidJobRequest extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidJobRequest";
  }
}

export enum JobStatus {
  Queued = "queued",
  Processing = "processing",
  Complete = "complete",
  Failed = "failed",
}

export type JobAssetSummary = {
  id: string;
  type: "image" | "video" | "audio";
  url: string;
};

export type JobStatusEvent = {
  jobId: string;
  status: JobStatus;
  errorMessage?: string;
  assets?: readonly JobAssetSummary[];
};

// Output settings that are NOT client-selectable. Size moved into
// GenerationParams; everything here stays fixed because it affects how the
// worker handles the response, not what the user is buying.
export const IMAGE_OUTPUT_PROFILE = Object.freeze({
  response_format: "url",
  output_format: "png",
  watermark: false,
} as const);

export const VOICE_PROFILE = Object.freeze({
  speaker: "en_female_stokie_uranus_bigtts",
  format: "mp3",
  sample_rate: 24000,
} as const);

// Expressive voice style routes through the richer tts/create endpoint instead
// of tts/unidirectional -- same prompt text, but the model reads emotion/tone/
// style direction out of it rather than speaking it flatly.
export const AUDIO_GENERATION_PROFILE = Object.freeze({
  model: "seed-audio-1.0",
  format: "mp3",
  sample_rate: 48000,
} as const);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

function assertNoUnknownFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  context: string,
): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((field) => !allowedSet.has(field));
  if (unknown.length > 0) {
    throw new InvalidJobRequest(
      `Unknown ${context} field(s): ${unknown.join(", ")}`,
    );
  }
}

function parseImageParams(raw: unknown): GenerationParams {
  if (raw === undefined) return DEFAULT_IMAGE_PARAMS;
  if (!isPlainObject(raw)) {
    throw new InvalidJobRequest("params must be an object");
  }
  assertNoUnknownFields(raw, ["size", "count"], "image params");

  const size =
    raw.size === undefined ? DEFAULT_IMAGE_PARAMS.size : (raw.size as ImageSize);
  if (!IMAGE_SIZES.includes(size)) {
    throw new InvalidJobRequest(`size must be one of ${IMAGE_SIZES.join(", ")}`);
  }
  const count =
    raw.count === undefined ? DEFAULT_IMAGE_PARAMS.count : raw.count;
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > MAX_BATCH_IMAGES
  ) {
    throw new InvalidJobRequest(
      `count must be a whole number between 1 and ${MAX_BATCH_IMAGES}`,
    );
  }

  return { type: "image", size, count };
}

function parseVideoParams(raw: unknown): GenerationParams {
  if (raw === undefined) return DEFAULT_VIDEO_PARAMS;
  if (!isPlainObject(raw)) {
    throw new InvalidJobRequest("params must be an object");
  }
  assertNoUnknownFields(
    raw,
    ["resolution", "ratio", "durationSeconds"],
    "video params",
  );

  const resolution =
    raw.resolution === undefined
      ? DEFAULT_VIDEO_PARAMS.resolution
      : (raw.resolution as VideoResolution);
  if (!VIDEO_RESOLUTIONS.includes(resolution)) {
    throw new InvalidJobRequest(
      `resolution must be one of ${VIDEO_RESOLUTIONS.join(", ")}`,
    );
  }

  const ratio =
    raw.ratio === undefined
      ? DEFAULT_VIDEO_PARAMS.ratio
      : (raw.ratio as VideoRatio);
  if (!VIDEO_RATIOS.includes(ratio)) {
    throw new InvalidJobRequest(`ratio must be one of ${VIDEO_RATIOS.join(", ")}`);
  }

  const durationSeconds =
    raw.durationSeconds === undefined
      ? DEFAULT_VIDEO_PARAMS.durationSeconds
      : raw.durationSeconds;
  if (
    typeof durationSeconds !== "number" ||
    !Number.isInteger(durationSeconds) ||
    durationSeconds < 1
  ) {
    throw new InvalidJobRequest("durationSeconds must be a positive integer");
  }

  return { type: "video", resolution, ratio, durationSeconds };
}

function parseVoiceParams(raw: unknown): GenerationParams {
  if (raw === undefined) return DEFAULT_VOICE_PARAMS;
  if (!isPlainObject(raw)) {
    throw new InvalidJobRequest("params must be an object");
  }
  assertNoUnknownFields(raw, ["style"], "voice params");

  const style =
    raw.style === undefined
      ? DEFAULT_VOICE_PARAMS.style
      : (raw.style as VoiceStyle);
  if (style !== "standard" && style !== "expressive") {
    throw new InvalidJobRequest("style must be standard or expressive");
  }
  return { type: "voice", style };
}

function parseInputAssets(raw: unknown): readonly JobInputAssetRef[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new InvalidJobRequest("inputAssets must be an array");
  }
  if (raw.length > MAX_INPUT_ASSETS_PER_JOB) {
    throw new InvalidJobRequest(
      `At most ${MAX_INPUT_ASSETS_PER_JOB} input assets are allowed`,
    );
  }

  const parsed = raw.map((entry): JobInputAssetRef => {
    if (!isPlainObject(entry)) {
      throw new InvalidJobRequest("Each input asset must be an object");
    }
    assertNoUnknownFields(entry, ["assetId", "role"], "input asset");

    if (typeof entry.assetId !== "string" || entry.assetId.trim().length === 0) {
      throw new InvalidJobRequest("Each input asset needs a non-empty assetId");
    }
    const role = entry.role as InputAssetRole;
    if (!INPUT_ASSET_ROLES.includes(role)) {
      throw new InvalidJobRequest(
        `Input asset role must be one of ${INPUT_ASSET_ROLES.join(", ")}`,
      );
    }
    return { assetId: entry.assetId, role };
  });

  // first_frame / last_frame each identify one specific slot; duplicates are
  // ambiguous rather than additive.
  for (const role of ["first_frame", "last_frame"] as const) {
    if (parsed.filter((asset) => asset.role === role).length > 1) {
      throw new InvalidJobRequest(`At most one ${role} input asset is allowed`);
    }
  }

  // source_video is the exception: extend takes 1-3 clips and stitches the
  // transitions between them, so several are additive rather than ambiguous.
  const sourceVideos = parsed.filter((asset) => asset.role === "source_video");
  if (sourceVideos.length > MAX_SOURCE_VIDEOS_PER_JOB) {
    throw new InvalidJobRequest(
      `At most ${MAX_SOURCE_VIDEOS_PER_JOB} source_video input assets are allowed`,
    );
  }

  return parsed;
}

/**
 * Shape and syntax validation only. Applies defaults so callers always receive
 * fully-populated params.
 *
 * Does NOT check that the parameters are supported by the configured model —
 * the model is resolved server-side and is not known here. Call
 * `assertParamsSupportedByModel` once it is.
 */
export function parseSubmitJobRequest(value: unknown): SubmitJobRequest {
  if (!isPlainObject(value)) {
    throw new InvalidJobRequest("Body must be a plain object");
  }

  assertNoUnknownFields(
    value,
    ["type", "prompt", "params", "inputAssets"],
    "request",
  );

  if (value.type !== "image" && value.type !== "video" && value.type !== "voice") {
    throw new InvalidJobRequest("Type must be image, video, or voice");
  }

  if (typeof value.prompt !== "string") {
    throw new InvalidJobRequest("Prompt must be a string");
  }
  const prompt = value.prompt.trim();
  if (prompt.length < 1 || prompt.length > 2000) {
    throw new InvalidJobRequest("Prompt must be 1-2000 characters");
  }

  const params =
    value.type === "image"
      ? parseImageParams(value.params)
      : value.type === "video"
        ? parseVideoParams(value.params)
        : parseVoiceParams(value.params);

  const inputAssets = parseInputAssets(value.inputAssets);

  // Guard the roles that only make sense for a video job, so a nonsensical
  // combination is rejected at the edge rather than confusing the worker.
  if (value.type !== "video") {
    const videoOnly = inputAssets.filter(
      (asset) => asset.role === "first_frame" || asset.role === "last_frame" || asset.role === "source_video",
    );
    if (videoOnly.length > 0) {
      throw new InvalidJobRequest(
        "first_frame, last_frame, and source_video input assets are only valid for video jobs",
      );
    }
  }

  // The provider's batch ceiling is shared between inputs and outputs:
  // references + generated <= 15 (R9). Rejecting here means the user is told
  // before being charged, rather than after the request fails upstream.
  if (params.type === "image" && inputAssets.length + params.count > MAX_BATCH_IMAGES) {
    throw new InvalidJobRequest(
      `Reference images plus generated images must not exceed ${MAX_BATCH_IMAGES}; ` +
        `this request asks for ${inputAssets.length} + ${params.count}`,
    );
  }

  // "adaptive" has nothing to adapt to without an input image, so a
  // text-to-video job asking for it is a client bug, not a valid request.
  if (params.type === "video" && ratioRequiresInputImage(params.ratio)) {
    if (inputAssets.length === 0) {
      throw new InvalidJobRequest(
        "ratio adaptive requires at least one input asset to take its ratio from",
      );
    }
  }

  return { type: value.type, prompt, params, inputAssets };
}

/**
 * Model-aware validation. Separate from parsing because the model is resolved
 * server-side from configuration, never supplied by the client.
 *
 * An unknown model validates against the deliberately narrow conservative
 * capability set rather than being waved through.
 */
export function assertParamsSupportedByModel(
  params: GenerationParams,
  model: string,
): void {
  if (params.type !== "video") return;

  const capabilities = videoCapabilitiesFor(model);

  if (!capabilities.resolutions.includes(params.resolution)) {
    throw new InvalidJobRequest(
      `Model ${model} supports resolutions: ${capabilities.resolutions.join(", ")}`,
    );
  }

  if (
    params.durationSeconds < capabilities.minDurationSeconds ||
    params.durationSeconds > capabilities.maxDurationSeconds
  ) {
    throw new InvalidJobRequest(
      `Model ${model} supports durations of ${capabilities.minDurationSeconds}-${capabilities.maxDurationSeconds}s`,
    );
  }
}
