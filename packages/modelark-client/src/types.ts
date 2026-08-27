export type ContentGenerationContentItemType =
  | "text"
  | "image_url"
  | "audio_url"
  | "video_url"
  | "draft_task";

export interface CreateContentGenerationContentItem {
  type: ContentGenerationContentItemType;
  text?: string;
  image_url?: { url: string };
  audio_url?: { url: string };
  video_url?: { url: string };
  role?: string;
  draft_task?: { id: string };
}

export interface CreateContentGenerationTaskRequest {
  model: string;
  content: CreateContentGenerationContentItem[];
  safety_identifier?: string;
  callback_url?: string;
  return_last_frame?: boolean;
  service_tier?: string;
  execution_expires_after?: number;
  priority?: number;
  generate_audio?: boolean;
  draft?: boolean;
  camera_fixed?: boolean;
  watermark?: boolean;
  seed?: number;
  resolution?: string;
  ratio?: string;
  duration?: number;
  frames?: number;
}

export interface CreateContentGenerationTaskResponse {
  id: string;
  safety_identifier?: string;
}

export type ContentGenerationStatus =
  | "succeeded"
  | "cancelled"
  | "failed"
  | "running"
  | "queued";

export interface ContentGenerationError {
  code: string;
  message: string;
}

export interface ContentGenerationContent {
  video_url: string;
  last_frame_url: string;
  file_url: string;
}

export interface GetContentGenerationTaskResponse {
  id: string;
  model: string;
  status: ContentGenerationStatus;
  error?: ContentGenerationError;
  content: ContentGenerationContent;
  resolution?: string;
  ratio?: string;
  duration?: number;
  frames?: number;
  frames_per_second?: number;
  created_at: number;
  updated_at: number;
  seed?: number;
  revised_prompt?: string;
  draft?: boolean;
  draft_task_id?: string;
}

export interface ListContentGenerationTasksFilter {
  status?: ContentGenerationStatus;
  task_ids?: string[];
  model?: string;
  service_tier?: string;
}

export interface ListContentGenerationTaskItem
  extends Omit<GetContentGenerationTaskResponse, "error"> {
  failure_reason?: ContentGenerationError;
}

export interface ListContentGenerationTasksResponse {
  total: number;
  items: ListContentGenerationTaskItem[];
}

export interface GenerateImagesRequest {
  model: string;
  prompt: string;
  image?: string | string[];
  response_format?: "url" | "b64_json";
  seed?: number;
  guidance_scale?: number;
  size?: string;
  watermark?: boolean;
  optimize_prompt?: boolean;
  sequential_image_generation?: "auto" | "disabled";
  sequential_image_generation_options?: { max_images?: number };
  output_format?: "jpeg" | "png";
}

export interface GeneratedImage {
  url?: string;
  b64_json?: string;
  size: string;
}

export interface GenerateImagesUsage {
  generated_images: number;
  output_tokens: number;
  total_tokens: number;
}

export interface ImagesResponse {
  model: string;
  created: number;
  data: GeneratedImage[];
  usage?: GenerateImagesUsage;
  error?: { code: string; message: string };
}

export type ChatMessageRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatMessageRole;
  content: string;
}

export interface JsonSchemaResponseFormat {
  type: "json_schema";
  json_schema: {
    name: string;
    schema: Record<string, unknown>;
    strict?: boolean;
  };
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  response_format?: JsonSchemaResponseFormat;
  temperature?: number;
  max_tokens?: number;
}

export interface ChatCompletionChoiceMessage {
  role: string;
  content: string;
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatCompletionChoiceMessage;
  finish_reason: string;
}

export interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: ChatCompletionUsage;
}
