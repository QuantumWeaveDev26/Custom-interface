export type SubmitJobRequest = {
  type: "image" | "video" | "voice";
  prompt: string;
  voiceStyle?: "standard" | "expressive";
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

export const IMAGE_PROFILE = Object.freeze({
  size: "4K",
  response_format: "url",
  output_format: "png",
  watermark: false,
  sequential_image_generation: "disabled",
} as const);

export const VIDEO_PROFILE = Object.freeze({
  resolution: "720p",
  ratio: "21:9",
  duration: 5,
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

export function parseSubmitJobRequest(value: unknown): SubmitJobRequest {
  if (!isPlainObject(value)) {
    throw new InvalidJobRequest("Body must be a plain object");
  }

  const allowedFields = new Set(["type", "prompt", "voiceStyle"]);
  if (Object.keys(value).some((field) => !allowedFields.has(field))) {
    throw new InvalidJobRequest("Only type, prompt, and voiceStyle are allowed");
  }

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

  if (value.voiceStyle !== undefined) {
    if (value.type !== "voice") {
      throw new InvalidJobRequest("voiceStyle is only valid for voice jobs");
    }
    if (value.voiceStyle !== "standard" && value.voiceStyle !== "expressive") {
      throw new InvalidJobRequest("voiceStyle must be standard or expressive");
    }
    return { type: value.type, prompt, voiceStyle: value.voiceStyle };
  }

  return { type: value.type, prompt };
}
