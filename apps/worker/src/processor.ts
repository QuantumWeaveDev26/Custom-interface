import type { JobRecord } from "@creative-ai/db";
import type {
  CreateContentGenerationContentItem,
  GetContentGenerationTaskResponse,
  ImagesResponse,
} from "@creative-ai/modelark-client";
import {
  AUDIO_GENERATION_PROFILE,
  IMAGE_OUTPUT_PROFILE,
  MODEL3D_QUALITY_PRESETS,
  JobStatus,
  VOICE_PROFILE,
  type InputAssetRole,
  type JobStatusEvent,
} from "@creative-ai/shared-types";

import {
  SAFE_CONTENT_FILTER_MESSAGE,
  SAFE_INPUT_IMAGE_REJECTED_MESSAGE,
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
  const text = errorSearchText(error);

  // Checked before the general filter test, which "sensitive" would otherwise
  // match — telling the user their *prompt* was rejected when the prompt was
  // fine and an input image was the problem.
  if (/InputImageSensitiveContentDetected|input image/i.test(text)) {
    return SAFE_INPUT_IMAGE_REJECTED_MESSAGE;
  }

  return /content[\s_-]*filter|safety[\s_-]*(?:filter|violation)|moderation|sensitive/i.test(
    text,
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
  type: "image" | "video" | "audio" | "model3d",
  assetIds: readonly string[],
): JobStatusEvent {
  return {
    jobId,
    status: JobStatus.Complete,
    assets: assetIds.map((assetId) => ({
      id: assetId,
      type,
      url: `/api/assets/${assetId}`,
    })),
  };
}

async function imageMedia(
  dependencies: GenerationProcessorDependencies,
  response: ImagesResponse,
): Promise<DownloadedMedia[]> {
  if (response.error !== undefined) {
    throw new ProviderResponseError(
      response.error.code,
      response.error.message,
    );
  }
  if (response.data.length === 0) {
    throw new Error("Image generation returned no images");
  }

  // A batch request states a maximum, not a quantity, so the count returned is
  // whatever the model produced. Every image is downloaded; the shortfall
  // against what was paid for is credited back at completion.
  const media: DownloadedMedia[] = [];
  for (const image of response.data) {
    if (image.url !== undefined && image.url.length > 0) {
      media.push(await dependencies.download(image.url));
      continue;
    }
    if (image.b64_json !== undefined && image.b64_json.length > 0) {
      media.push({
        body: Buffer.from(image.b64_json, "base64"),
        contentType: "image/png",
      });
      continue;
    }
    throw new Error("Image response has no URL or base64 payload");
  }
  return media;
}

async function processImage(
  dependencies: GenerationProcessorDependencies,
  job: JobRecord,
): Promise<JobStatusEvent> {
  const params = job.inputParams.params;
  if (params.type !== "image") {
    throw new Error(`Image job ${job.id} has ${params.type} params`);
  }

  // Multi-reference image-to-image (MODELARK_API_REFERENCE.md, R3): the same
  // endpoint takes an `image` array of reference URLs. Order is meaningful --
  // prompts address references positionally ("image 1", "image 2") -- so the
  // links are loaded in `position` order and that order is preserved here.
  const references = await dependencies.loadInputAssets(job.id, job.userId);
  const referenceUrls: string[] = [];
  for (const asset of references) {
    if (asset.type !== "image" && asset.type !== "video") continue;
    referenceUrls.push(await dependencies.signAssetUrl(asset.storageUrl));
  }

  if (referenceUrls.length > 0) {
    // Logged because a silently-ignored reference looks identical to a working
    // one from the UI: you get a plausible image that just isn't your subject.
    // This line is how you tell "references weren't sent" from "the model
    // underweighted them".
    console.log(
      `Job ${job.id}: sending ${referenceUrls.length} reference image(s)`,
    );
  }

  const response = await dependencies.modelArk.createImage({
    model: job.model,
    prompt: job.inputParams.prompt,
    size: params.size,
    ...(referenceUrls.length > 0 ? { image: referenceUrls } : {}),
    // Batch is opt-in per job (R9): "auto" turns it on, and max_images is only
    // read when it is. A count of 1 must stay a plain single-image request.
    ...(params.count > 1
      ? {
          sequential_image_generation: "auto" as const,
          sequential_image_generation_options: { max_images: params.count },
        }
      : {}),
    ...IMAGE_OUTPUT_PROFILE,
  });
  const media = await imageMedia(dependencies, response);

  if (media.length !== params.count) {
    // Not an error — the provider returns up to max_images. Logged because the
    // credit refund that follows is otherwise invisible.
    console.log(
      `Job ${job.id}: asked for ${params.count} image(s), received ${media.length}`,
    );
  }

  const assetInputs = [];
  for (const item of media) {
    const storageUrl = await dependencies.storage.upload({
      userId: job.userId,
      jobId: job.id,
      type: "image",
      ...item,
    });
    assetInputs.push({ type: "image" as const, storageUrl });
  }

  const completed = await dependencies.completeJobWithAssets(job.id, assetInputs);
  return completeEvent(
    job.id,
    "image",
    completed.assets.map((asset) => asset.id),
  );
}

/**
 * Text-to-3D (MODELARK_API_REFERENCE.md, R5).
 *
 * Reuses the video task endpoint — the difference is the model, the settings
 * carried as CLI-style flags inside the prompt text rather than as JSON fields,
 * and the finished file arriving under `content.file_url` instead of
 * `video_url`.
 *
 * Only flags with a confirmed sample value are sent. `--material PBR` came from
 * the provider's own sample and `--quality_override` is bounded by the
 * documented polygon range; nothing else is guessed at, because an unaccepted
 * value fails after the user has already been charged.
 */
async function processModel3d(
  dependencies: GenerationProcessorDependencies,
  job: JobRecord,
  resumedTaskId: string | null,
): Promise<JobStatusEvent> {
  const params = job.inputParams.params;
  if (params.type !== "model3d") {
    throw new Error(`3D job ${job.id} has ${params.type} params`);
  }

  let externalTaskId = resumedTaskId;
  if (externalTaskId === null) {
    const budget = MODEL3D_QUALITY_PRESETS[params.quality];
    const createdTask = await dependencies.modelArk.createVideoTask({
      model: job.model,
      content: [
        {
          type: "text",
          text: `${job.inputParams.prompt} --material PBR --quality_override ${budget}`,
        },
      ],
    });
    if (createdTask.id.length === 0) {
      throw new Error("3D task creation returned an empty task ID");
    }
    externalTaskId = createdTask.id;
    // Persisted before polling so a crash mid-generation resumes the existing
    // task instead of paying for a second one.
    await dependencies.saveExternalTaskId(job.id, externalTaskId);
  }

  const task = await dependencies.modelArk.pollVideoTaskUntilDone(externalTaskId);
  if (task.status === "failed") {
    throw new ProviderResponseError(
      task.error?.code ?? "model3d_failed",
      task.error?.message ?? "3D generation failed",
    );
  }
  if (task.status !== "succeeded") {
    throw new Error(`3D poll returned non-terminal status ${task.status}`);
  }
  if (task.content.file_url.length === 0) {
    throw new Error("3D response has no file URL");
  }

  // The provider's URL is pre-signed and expires in 7 days, so the mesh is
  // copied into our own storage rather than linked to.
  const media = await dependencies.download(task.content.file_url);
  const storageUrl = await dependencies.storage.upload({
    userId: job.userId,
    jobId: job.id,
    type: "model3d",
    ...media,
  });
  const completed = await dependencies.completeJobWithAssets(job.id, [
    { type: "model3d", storageUrl },
  ]);
  return completeEvent(job.id, "model3d", [completed.assets[0]!.id]);
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
  const completed = await dependencies.completeJobWithAssets(job.id, [
    { type: "audio", storageUrl },
  ]);
  return completeEvent(job.id, "audio", [completed.assets[0]!.id]);
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

/**
 * Builds the `content[]` array for a video task.
 *
 * Confirmed contract (MODELARK_API_REFERENCE.md, R2 and R4): image-to-video,
 * omni reference, edit, and extend are all the same endpoint as text-to-video.
 * Only the `content[]` items and their `role` differ.
 *
 * The wire role names are not the role names this project stores, and the
 * difference is not cosmetic: an image sent with no role at all is read by the
 * provider as a first frame. Sending a reference image unroled therefore does
 * not mean "no role", it means "keyframe" — silently the wrong generation.
 *
 * Each input asset is signed into a short-lived HTTPS URL because BytePlus
 * fetches the media itself and cannot read our private bucket.
 */
const WIRE_ROLE: Readonly<Record<InputAssetRole, string>> = Object.freeze({
  first_frame: "first_frame",
  last_frame: "last_frame",
  reference: "reference_image",
  source_video: "reference_video",
});

async function buildVideoContent(
  dependencies: GenerationProcessorDependencies,
  job: JobRecord,
): Promise<CreateContentGenerationContentItem[]> {
  const content: CreateContentGenerationContentItem[] = [
    { type: "text", text: job.inputParams.prompt },
  ];

  const inputAssets = await dependencies.loadInputAssets(job.id, job.userId);

  for (const asset of inputAssets) {
    // Audio inputs are not wired yet. Skipping is safer than guessing a shape
    // the provider would reject mid-generation.
    if (asset.type !== "image" && asset.type !== "video") continue;

    const url = await dependencies.signAssetUrl(asset.storageUrl);
    content.push(
      asset.type === "video"
        ? { type: "video_url", video_url: { url }, role: WIRE_ROLE.source_video }
        : { type: "image_url", image_url: { url }, role: WIRE_ROLE[asset.role] },
    );
  }

  return content;
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
    const content = await buildVideoContent(dependencies, job);
    const createdTask = await dependencies.modelArk.createVideoTask({
      model: job.model,
      content,
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
  const completed = await dependencies.completeJobWithAssets(job.id, [
    { type: "video", storageUrl },
  ]);
  return completeEvent(job.id, "video", [completed.assets[0]!.id]);
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
      throw new Error(
        `A processing ${currentJob.type} job has no persisted provider task ID`,
      );
    }
    job = currentJob;
    resumedVideoTaskId = currentJob.externalTaskId;
  } else {
    await dependencies.publish({ jobId, status: JobStatus.Processing });
  }

  if (job.type === "image") return processImage(dependencies, job);
  if (job.type === "voice") return processVoice(dependencies, job);
  if (job.type === "model3d") {
    return processModel3d(dependencies, job, resumedVideoTaskId);
  }
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
