import type { JobRecord } from "@creative-ai/db";
import type {
  GetContentGenerationTaskResponse,
  ImagesResponse,
} from "@creative-ai/modelark-client";
import {
  AUDIO_GENERATION_PROFILE,
  IMAGE_OUTPUT_PROFILE,
  JobStatus,
  VOICE_PROFILE,
  type JobStatusEvent,
} from "@creative-ai/shared-types";

import {
  SAFE_CONTENT_FILTER_MESSAGE,
  SAFE_GENERATION_FAILURE_MESSAGE,
} from "./config.js";
import type {
  DownloadedMedia,
  GenerationProcessorDependencies,
} from "./contracts.js";

class ProviderResponseError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProviderResponseError";
  }
}

function errorSearchText(error: unknown): string {
  if (error instanceof ProviderResponseError) {
    return `${error.code} ${error.message}`;
  }
  if (error instanceof Error) {
    const responseBody =
      "responseBody" in error && typeof error.responseBody === "string"
        ? error.responseBody
        : "";
    return `${error.name} ${error.message} ${responseBody}`;
  }
  return "";
}

function safeFailureMessage(error: unknown): string {
  return /content[\s_-]*filter|safety[\s_-]*(?:filter|violation)|moderation|sensitive/i.test(
    errorSearchText(error),
  )
    ? SAFE_CONTENT_FILTER_MESSAGE
    : SAFE_GENERATION_FAILURE_MESSAGE;
}

async function failAndPublish(
  dependencies: GenerationProcessorDependencies,
  jobId: string,
  error: unknown,
): Promise<void> {
  const message = safeFailureMessage(error);
  // Log the real error server-side for debugging -- only the sanitized
  // `message` above is ever stored on the job or published to the client.
  console.error(`Job ${jobId} failed:`, error);
  await dependencies.failAndRefund(jobId, message);
  await dependencies.publish({
    jobId,
    status: JobStatus.Failed,
    errorMessage: message,
  });
}

function completeEvent(
  jobId: string,
  type: "image" | "video" | "audio",
  assetId: string,
): JobStatusEvent {
  return {
    jobId,
    status: JobStatus.Complete,
    assets: [
      {
        id: assetId,
        type,
        url: `/api/assets/${assetId}`,
      },
    ],
  };
}

async function imageMedia(
  dependencies: GenerationProcessorDependencies,
  response: ImagesResponse,
): Promise<DownloadedMedia> {
  if (response.error !== undefined) {
    throw new ProviderResponseError(
      response.error.code,
      response.error.message,
    );
  }
  if (response.data.length !== 1) {
    throw new Error("Image generation did not return exactly one image");
  }

  const image = response.data[0];
  if (image?.url !== undefined && image.url.length > 0) {
    return dependencies.download(image.url);
  }
  if (image?.b64_json !== undefined && image.b64_json.length > 0) {
    return {
      body: Buffer.from(image.b64_json, "base64"),
      contentType: "image/png",
    };
  }
  throw new Error("Image response has no URL or base64 payload");
}

async function processImage(
  dependencies: GenerationProcessorDependencies,
  job: JobRecord,
): Promise<JobStatusEvent> {
  const params = job.inputParams.params;
  if (params.type !== "image") {
    throw new Error(`Image job ${job.id} has ${params.type} params`);
  }
  const response = await dependencies.modelArk.createImage({
    model: job.model,
    prompt: job.inputParams.prompt,
    size: params.size,
    ...IMAGE_OUTPUT_PROFILE,
  });
  const media = await imageMedia(dependencies, response);
  const storageUrl = await dependencies.storage.upload({
    userId: job.userId,
    jobId: job.id,
    type: "image",
    ...media,
  });
  const completed = await dependencies.completeJobWithAsset(job.id, {
    type: "image",
    storageUrl,
  });
  return completeEvent(job.id, "image", completed.asset.id);
}

async function processVoice(
  dependencies: GenerationProcessorDependencies,
  job: JobRecord,
): Promise<JobStatusEvent> {
  const params = job.inputParams.params;
  if (params.type !== "voice") {
    throw new Error(`Voice job ${job.id} has ${params.type} params`);
  }
  const result =
    params.style === "expressive"
      ? await dependencies.voice.createAudioGeneration({
          model: AUDIO_GENERATION_PROFILE.model,
          text_prompt: job.inputParams.prompt,
          audio_config: {
            format: AUDIO_GENERATION_PROFILE.format,
            sample_rate: AUDIO_GENERATION_PROFILE.sample_rate,
          },
        })
      : await dependencies.voice.createSpeech({
          req_params: {
            text: job.inputParams.prompt,
            speaker: VOICE_PROFILE.speaker,
            audio_params: {
              format: VOICE_PROFILE.format,
              sample_rate: VOICE_PROFILE.sample_rate,
            },
          },
        });
  const storageUrl = await dependencies.storage.upload({
    userId: job.userId,
    jobId: job.id,
    type: "audio",
    body: result.audio,
    contentType: result.contentType,
  });
  const completed = await dependencies.completeJobWithAsset(job.id, {
    type: "audio",
    storageUrl,
  });
  return completeEvent(job.id, "audio", completed.asset.id);
}

function assertSucceededVideo(
  task: GetContentGenerationTaskResponse,
): string {
  if (task.status === "failed") {
    throw new ProviderResponseError(
      task.error?.code ?? "video_failed",
      task.error?.message ?? "Video generation failed",
    );
  }
  if (task.status === "cancelled") {
    throw new ProviderResponseError(
      "video_cancelled",
      "Video generation cancelled",
    );
  }
  if (task.status !== "succeeded") {
    throw new Error(`Video poll returned non-terminal status ${task.status}`);
  }
  if (task.content.video_url.length === 0) {
    throw new Error("Video response has no URL");
  }
  return task.content.video_url;
}

async function processVideo(
  dependencies: GenerationProcessorDependencies,
  job: JobRecord,
  resumedTaskId: string | null,
): Promise<JobStatusEvent> {
  const params = job.inputParams.params;
  if (params.type !== "video") {
    throw new Error(`Video job ${job.id} has ${params.type} params`);
  }

  let externalTaskId = resumedTaskId;
  if (externalTaskId === null) {
    const createdTask = await dependencies.modelArk.createVideoTask({
      model: job.model,
      content: [{ type: "text", text: job.inputParams.prompt }],
      resolution: params.resolution,
      ratio: params.ratio,
      duration: params.durationSeconds,
    });
    if (createdTask.id.trim().length === 0) {
      throw new Error("Video creation returned an empty task ID");
    }
    externalTaskId = createdTask.id;
    await dependencies.saveExternalTaskId(job.id, externalTaskId);
  }

  const task = await dependencies.modelArk.pollVideoTaskUntilDone(
    externalTaskId,
  );
  const videoUrl = assertSucceededVideo(task);
  const media = await dependencies.download(videoUrl);
  const storageUrl = await dependencies.storage.upload({
    userId: job.userId,
    jobId: job.id,
    type: "video",
    ...media,
  });
  const completed = await dependencies.completeJobWithAsset(job.id, {
    type: "video",
    storageUrl,
  });
  return completeEvent(job.id, "video", completed.asset.id);
}

async function processGeneration(
  dependencies: GenerationProcessorDependencies,
  jobId: string,
): Promise<JobStatusEvent | null> {
  let job = await dependencies.loadJob(jobId);
  if (job === null) throw new Error(`Job ${jobId} was not found`);
  if (job.status === "complete" || job.status === "failed") return null;

  let resumedVideoTaskId: string | null = null;
  const claimed = await dependencies.claimQueuedJob(jobId);
  if (claimed === null) {
    const currentJob = await dependencies.loadJob(jobId);
    if (
      currentJob === null ||
      currentJob.status === "complete" ||
      currentJob.status === "failed"
    ) {
      return null;
    }
    if (currentJob.type === "image" || currentJob.type === "voice") {
      throw new Error(`A ${currentJob.type} job was already processing`);
    }
    if (currentJob.externalTaskId === null) {
      throw new Error("A processing video has no persisted provider task ID");
    }
    job = currentJob;
    resumedVideoTaskId = currentJob.externalTaskId;
  } else {
    await dependencies.publish({ jobId, status: JobStatus.Processing });
  }

  if (job.type === "image") return processImage(dependencies, job);
  if (job.type === "voice") return processVoice(dependencies, job);
  return processVideo(dependencies, job, resumedVideoTaskId);
}

export function createGenerationProcessor(
  dependencies: GenerationProcessorDependencies,
): (jobId: string) => Promise<void> {
  return async (jobId) => {
    let completedEvent: JobStatusEvent | null;
    try {
      completedEvent = await processGeneration(dependencies, jobId);
    } catch (error) {
      await failAndPublish(dependencies, jobId, error);
      return;
    }

    if (completedEvent !== null) {
      await dependencies.publish(completedEvent);
    }
  };
}
