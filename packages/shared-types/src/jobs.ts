export type SubmitJobRequest = {
  type: "image" | "video";
  prompt: string;
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
  type: "image" | "video";
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

  const allowedFields = new Set(["type", "prompt"]);
  if (Object.keys(value).some((field) => !allowedFields.has(field))) {
    throw new InvalidJobRequest("Only type and prompt are allowed");
  }

  if (value.type !== "image" && value.type !== "video") {
    throw new InvalidJobRequest("Type must be image or video");
  }

  if (typeof value.prompt !== "string") {
    throw new InvalidJobRequest("Prompt must be a string");
  }

  const prompt = value.prompt.trim();
  if (prompt.length < 1 || prompt.length > 2000) {
    throw new InvalidJobRequest("Prompt must be 1-2000 characters");
  }

  return { type: value.type, prompt };
}
