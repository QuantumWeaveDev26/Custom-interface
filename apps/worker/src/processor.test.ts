import assert from "node:assert/strict";
import test from "node:test";

import type { CompleteJobResult, JobRecord } from "@creative-ai/db";
import type {
  CreateContentGenerationTaskRequest,
  GenerateImagesRequest,
  GetContentGenerationTaskResponse,
  ImagesResponse,
} from "@creative-ai/modelark-client";
import { ModelArkTimeoutError } from "@creative-ai/modelark-client";
import { JobStatus, type JobStatusEvent } from "@creative-ai/shared-types";

import type {
  GenerationProcessorDependencies,
  StorageUploadInput,
} from "./contracts.js";
import {
  SAFE_CONTENT_FILTER_MESSAGE,
  SAFE_GENERATION_FAILURE_MESSAGE,
  SAFE_INPUT_IMAGE_REJECTED_MESSAGE,
  SAFE_TIMEOUT_MESSAGE,
} from "./config.js";
import { createGenerationProcessor } from "./processor.js";

const FIXED_TIME = new Date("2026-08-27T00:00:00.000Z");

function imageJob(status: JobRecord["status"] = "queued"): JobRecord {
  return {
    id: "image-job",
    userId: "user-1",
    type: "image",
    model: "seedream-5-0-lite-260128",
    status,
    inputParams: {
      prompt: "portrait in dramatic light",
      params: { type: "image", size: "4K", count: 1 },
    },
    externalTaskId: null,
    errorMessage: null,
    creditsCost: 1,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
  };
}

function imageResponse(url: string): ImagesResponse {
  return {
    model: "seedream-5-0-lite-260128",
    created: 1_777_000_000,
    data: [{ url, size: "4K" }],
    usage: {
      generated_images: 1,
      output_tokens: 1,
      total_tokens: 1,
    },
  };
}

function voiceJob(style: "standard" | "expressive" = "standard"): JobRecord {
  return {
    id: "voice-job",
    userId: "user-1",
    type: "voice",
    model: "seed-tts-2.0",
    status: "queued",
    inputParams: {
      prompt: "welcome to the show",
      params: { type: "voice", style },
    },
    externalTaskId: null,
    errorMessage: null,
    creditsCost: 1,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
  };
}

function videoJob(
  status: JobRecord["status"] = "queued",
  externalTaskId: string | null = null,
): JobRecord {
  return {
    id: "video-job",
    userId: "user-1",
    type: "video",
    model: "dreamina-seedance-2-0-fast-260128",
    status,
    inputParams: {
      prompt: "orbital sunrise",
      params: {
        type: "video",
        resolution: "720p",
        ratio: "21:9",
        durationSeconds: 5,
      },
    },
    externalTaskId,
    errorMessage: null,
    creditsCost: 14,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
  };
}

function videoResponse(
  status: GetContentGenerationTaskResponse["status"] = "succeeded",
  videoUrl = "https://modelark.example/video.mp4",
): GetContentGenerationTaskResponse {
  return {
    id: "modelark-task-1",
    model: "dreamina-seedance-2-0-fast-260128",
    status,
    content: {
      video_url: videoUrl,
      last_frame_url: "https://modelark.example/frame.png",
      file_url: videoUrl,
    },
    resolution: "720p",
    ratio: "21:9",
    duration: 5,
    frames: 120,
    frames_per_second: 24,
    created_at: 1_777_000_000,
    updated_at: 1_777_000_001,
  };
}

interface VideoHarnessOptions {
  createdTaskId?: string;
  pollResult?: GetContentGenerationTaskResponse;
  pollError?: Error;
}

function createVideoHarness(
  initialJob: JobRecord,
  options: VideoHarnessOptions = {},
): {
  dependencies: GenerationProcessorDependencies;
  operations: string[];
  createRequests: CreateContentGenerationTaskRequest[];
  polledTaskIds: string[];
  refunds: string[];
  events: JobStatusEvent[];
  loadCount(): number;
} {
  let currentJob = initialJob;
  let loadCount = 0;
  const operations: string[] = [];
  const createRequests: CreateContentGenerationTaskRequest[] = [];
  const polledTaskIds: string[] = [];
  const refunds: string[] = [];
  const events: JobStatusEvent[] = [];
  const dependencies: GenerationProcessorDependencies = {
    loadJob: async () => {
      loadCount += 1;
      return currentJob;
    },
    claimQueuedJob: async () => {
      operations.push("db:claim");
      if (currentJob.status !== "queued") return null;
      currentJob = { ...currentJob, status: "processing" };
      return true;
    },
    failAndRefund: async (_jobId, message) => {
      operations.push("db:refund");
      refunds.push(message);
      currentJob = { ...currentJob, status: "failed", errorMessage: message };
      return true;
    },
    saveExternalTaskId: async (_jobId, externalTaskId) => {
      operations.push(`db:save-task:${externalTaskId}`);
      currentJob = { ...currentJob, externalTaskId };
    },
    completeJobWithAssets: async (_jobId, assetInputs) => {
      operations.push("db:complete");
      currentJob = { ...currentJob, status: "complete" };
      return {
        job: currentJob,
        assets: assetInputs.map((assetInput, index) => ({
          id: index === 0 ? "video-asset-1" : `video-asset-1-${index + 1}`,
          jobId: currentJob.id,
          userId: currentJob.userId,
          type: assetInput.type,
          storageUrl: assetInput.storageUrl,
          thumbnailUrl: assetInput.thumbnailUrl ?? null,
          createdAt: FIXED_TIME,
        })),
      };
    },
    modelArk: {
      createImage: async () => {
        throw new Error("video flow must not create an image");
      },
      createVideoTask: async (request) => {
        operations.push("modelark:create-video");
        createRequests.push(request);
        return { id: options.createdTaskId ?? "modelark-task-1" };
      },
      pollVideoTaskUntilDone: async (taskId) => {
        operations.push(`modelark:poll:${taskId}`);
        polledTaskIds.push(taskId);
        if (options.pollError !== undefined) throw options.pollError;
        return options.pollResult ?? videoResponse();
      },
    },
    voice: {
      createSpeech: async () => {
        throw new Error("video flow must not call voice");
      },
      createAudioGeneration: async () => {
        throw new Error("video flow must not call voice");
      },
    },
    download: async (url) => {
      operations.push(`download:${url}`);
      return {
        body: Uint8Array.from([4, 5, 6]),
        contentType: "video/mp4",
      };
    },
    storage: {
      upload: async (input) => {
        operations.push(`storage:upload:${input.type}`);
        return "tos://assets/user-1/video-job/video.mp4";
      },
    },
    publish: async (event) => {
      operations.push(`publish:${event.status}`);
      events.push(event);
    },
    loadInputAssets: async () => [],
    signAssetUrl: async (storageUrl) => `https://signed.example/${storageUrl}`,
  };
  return {
    dependencies,
    operations,
    createRequests,
    polledTaskIds,
    refunds,
    events,
    loadCount: () => loadCount,
  };
}

interface ImageFailureHarnessOptions {
  response?: ImagesResponse;
  createError?: Error;
  downloadError?: Error;
  storageError?: Error;
  completionError?: Error;
}

function createImageFailureHarness(options: ImageFailureHarnessOptions): {
  dependencies: GenerationProcessorDependencies;
  refunds: string[];
  events: JobStatusEvent[];
  uploads: StorageUploadInput[];
  operations: string[];
  imageCalls(): number;
  downloadCalls(): number;
  pollCalls(): number;
  imageRequests(): GenerateImagesRequest[];
} {
  let currentJob = imageJob();
  const imageRequests: GenerateImagesRequest[] = [];
  let imageCalls = 0;
  let downloadCalls = 0;
  let pollCalls = 0;
  const refunds: string[] = [];
  const events: JobStatusEvent[] = [];
  const uploads: StorageUploadInput[] = [];
  const operations: string[] = [];
  const dependencies: GenerationProcessorDependencies = {
    loadJob: async () => currentJob,
    claimQueuedJob: async () => {
      operations.push("db:claim");
      currentJob = { ...currentJob, status: "processing" };
      return true;
    },
    failAndRefund: async (_jobId, message) => {
      operations.push("db:refund");
      refunds.push(message);
      currentJob = { ...currentJob, status: "failed", errorMessage: message };
      return refunds.length === 1;
    },
    saveExternalTaskId: async () => {
      throw new Error("image flow must not save a video task ID");
    },
    completeJobWithAssets: async (_jobId, assetInputs) => {
      if (options.completionError !== undefined) {
        throw options.completionError;
      }
      currentJob = { ...currentJob, status: "complete" };
      return {
        job: currentJob,
        assets: assetInputs.map((assetInput, index) => ({
          id: index === 0 ? "asset-1" : `asset-1-${index + 1}`,
          jobId: currentJob.id,
          userId: currentJob.userId,
          type: assetInput.type,
          storageUrl: assetInput.storageUrl,
          thumbnailUrl: assetInput.thumbnailUrl ?? null,
          createdAt: FIXED_TIME,
        })),
      };
    },
    modelArk: {
      createImage: async (request) => {
        operations.push("modelark:image");
        imageRequests.push(request);
        imageCalls += 1;
        if (options.createError !== undefined) throw options.createError;
        return (
          options.response ??
          imageResponse("https://modelark.example/image.png")
        );
      },
      createVideoTask: async () => {
        throw new Error("image flow must not create a video task");
      },
      pollVideoTaskUntilDone: async () => {
        pollCalls += 1;
        throw new Error("image flow must not poll");
      },
    },
    voice: {
      createSpeech: async () => {
        throw new Error("image flow must not call voice");
      },
      createAudioGeneration: async () => {
        throw new Error("image flow must not call voice");
      },
    },
    download: async () => {
      downloadCalls += 1;
      if (options.downloadError !== undefined) throw options.downloadError;
      return {
        body: Uint8Array.from([7, 8, 9]),
        contentType: "image/png",
      };
    },
    storage: {
      upload: async (input) => {
        uploads.push(input);
        if (options.storageError !== undefined) throw options.storageError;
        return "tos://assets/user-1/image-job/image.png";
      },
    },
    publish: async (event) => {
      operations.push(`publish:${event.status}`);
      events.push(event);
    },
    loadInputAssets: async () => [],
    signAssetUrl: async (storageUrl) => `https://signed.example/${storageUrl}`,
  };
  return {
    dependencies,
    refunds,
    events,
    uploads,
    operations,
    imageCalls: () => imageCalls,
    downloadCalls: () => downloadCalls,
    pollCalls: () => pollCalls,
    imageRequests: () => imageRequests,
  };
}

function assertSafeFailure(
  refunds: string[],
  events: JobStatusEvent[],
  expectedMessage: string,
  forbiddenRawDetail?: RegExp,
): void {
  assert.deepEqual(refunds, [expectedMessage]);
  assert.equal(events.at(-1)?.status, JobStatus.Failed);
  assert.equal(events.at(-1)?.errorMessage, expectedMessage);
  if (forbiddenRawDetail !== undefined) {
    assert.doesNotMatch(events.at(-1)?.errorMessage ?? "", forbiddenRawDetail);
  }
}

test("claims an image job, creates once without polling, and publishes after durable changes", async () => {
  let currentJob = imageJob();
  const operations: string[] = [];
  const imageRequests: GenerateImagesRequest[] = [];
  const uploads: StorageUploadInput[] = [];
  const events: JobStatusEvent[] = [];
  let pollCalls = 0;
  const dependencies: GenerationProcessorDependencies = {
    loadJob: async () => currentJob,
    claimQueuedJob: async () => {
      operations.push("db:claim");
      currentJob = { ...currentJob, status: "processing" };
      return true;
    },
    failAndRefund: async () => {
      throw new Error("happy path must not refund");
    },
    saveExternalTaskId: async () => {
      throw new Error("image flow must not save a video task ID");
    },
    completeJobWithAssets: async (_jobId, assetInputs) => {
      operations.push("db:complete");
      currentJob = { ...currentJob, status: "complete" };
      const result: CompleteJobResult = {
        job: currentJob,
        assets: assetInputs.map((assetInput, index) => ({
          id: index === 0 ? "asset-1" : `asset-1-${index + 1}`,
          jobId: currentJob.id,
          userId: currentJob.userId,
          type: assetInput.type,
          storageUrl: assetInput.storageUrl,
          thumbnailUrl: assetInput.thumbnailUrl ?? null,
          createdAt: FIXED_TIME,
        })),
      };
      return result;
    },
    modelArk: {
      createImage: async (request) => {
        operations.push("modelark:image");
        imageRequests.push(request);
        return imageResponse("https://modelark.example/image.png");
      },
      createVideoTask: async () => {
        throw new Error("image flow must not create a video task");
      },
      pollVideoTaskUntilDone: async () => {
        pollCalls += 1;
        throw new Error("image flow must not poll");
      },
    },
    voice: {
      createSpeech: async () => {
        throw new Error("image flow must not call voice");
      },
      createAudioGeneration: async () => {
        throw new Error("image flow must not call voice");
      },
    },
    download: async (url) => {
      operations.push(`download:${url}`);
      return {
        body: Uint8Array.from([1, 2, 3]),
        contentType: "image/png",
      };
    },
    storage: {
      upload: async (input) => {
        operations.push("storage:upload");
        uploads.push(input);
        return "tos://assets/user-1/image-job/image.png";
      },
    },
    publish: async (event) => {
      operations.push(`publish:${event.status}`);
      events.push(event);
    },
    loadInputAssets: async () => [],
    signAssetUrl: async (storageUrl) => `https://signed.example/${storageUrl}`,
  };

  await createGenerationProcessor(dependencies)("image-job");

  assert.deepEqual(imageRequests, [
    {
      model: "seedream-5-0-lite-260128",
      prompt: "portrait in dramatic light",
      size: "4K",
      response_format: "url",
      output_format: "png",
      watermark: false,
    },
  ]);
  assert.equal(pollCalls, 0);
  assert.deepEqual(uploads, [
    {
      userId: "user-1",
      jobId: "image-job",
      type: "image",
      body: Uint8Array.from([1, 2, 3]),
      contentType: "image/png",
    },
  ]);
  assert.deepEqual(operations, [
    "db:claim",
    "publish:processing",
    "modelark:image",
    "download:https://modelark.example/image.png",
    "storage:upload",
    "db:complete",
    "publish:complete",
  ]);
  assert.deepEqual(events, [
    { jobId: "image-job", status: JobStatus.Processing },
    {
      jobId: "image-job",
      status: JobStatus.Complete,
      assets: [
        {
          id: "asset-1",
          type: "image",
          url: "/api/assets/asset-1",
        },
      ],
    },
  ]);
});

test("an already-processing image fails and refunds without replaying createImage", async () => {
  const job = imageJob("processing");
  const refunds: string[] = [];
  const events: JobStatusEvent[] = [];
  let imageCalls = 0;
  const dependencies: GenerationProcessorDependencies = {
    loadJob: async () => job,
    claimQueuedJob: async () => null,
    failAndRefund: async (_jobId, message) => {
      refunds.push(message);
      return true;
    },
    saveExternalTaskId: async () => {
      throw new Error("image flow must not save a video task ID");
    },
    completeJobWithAssets: async () => {
      throw new Error("stalled image must not complete");
    },
    modelArk: {
      createImage: async () => {
        imageCalls += 1;
        return imageResponse("https://unexpected.example/image.png");
      },
      createVideoTask: async () => {
        throw new Error("image flow must not create a video task");
      },
      pollVideoTaskUntilDone: async () => {
        throw new Error("image flow must not poll");
      },
    },
    voice: {
      createSpeech: async () => {
        throw new Error("image flow must not call voice");
      },
      createAudioGeneration: async () => {
        throw new Error("image flow must not call voice");
      },
    },
    download: async () => {
      throw new Error("stalled image must not download");
    },
    storage: {
      upload: async () => {
        throw new Error("stalled image must not upload");
      },
    },
    publish: async (event) => {
      events.push(event);
    },
    loadInputAssets: async () => [],
    signAssetUrl: async (storageUrl) => `https://signed.example/${storageUrl}`,
  };

  await createGenerationProcessor(dependencies)(job.id);

  assert.equal(imageCalls, 0);
  assert.equal(refunds.length, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.status, JobStatus.Failed);
  assert.equal(events[0]?.errorMessage, refunds[0]);
  assert.doesNotMatch(refunds[0] ?? "", /processing|replay|provider/i);
});

test("a newly claimed video persists its task ID before polling and completes", async () => {
  const harness = createVideoHarness(videoJob());

  await createGenerationProcessor(harness.dependencies)("video-job");

  assert.deepEqual(harness.createRequests, [
    {
      model: "dreamina-seedance-2-0-fast-260128",
      content: [{ type: "text", text: "orbital sunrise" }],
      resolution: "720p",
      ratio: "21:9",
      duration: 5,
    },
  ]);
  assert.deepEqual(harness.polledTaskIds, ["modelark-task-1"]);
  assert.deepEqual(harness.operations, [
    "db:claim",
    "publish:processing",
    "modelark:create-video",
    "db:save-task:modelark-task-1",
    "modelark:poll:modelark-task-1",
    "download:https://modelark.example/video.mp4",
    "storage:upload:video",
    "db:complete",
    "publish:complete",
  ]);
  assert.equal(harness.refunds.length, 0);
  assert.equal(harness.events.at(-1)?.status, JobStatus.Complete);
});

test("an already-processing video resumes its stored task without creating again", async () => {
  const harness = createVideoHarness(
    videoJob("processing", "existing-modelark-task"),
  );

  await createGenerationProcessor(harness.dependencies)("video-job");

  assert.equal(harness.createRequests.length, 0);
  assert.deepEqual(harness.polledTaskIds, ["existing-modelark-task"]);
  assert.equal(harness.loadCount(), 2);
  assert.equal(harness.events.at(-1)?.status, JobStatus.Complete);
  assert.equal(harness.refunds.length, 0);
});

test("an ambiguous processing video refunds without creating a duplicate task", async () => {
  const harness = createVideoHarness(videoJob("processing", null));

  await createGenerationProcessor(harness.dependencies)("video-job");

  assert.equal(harness.createRequests.length, 0);
  assert.equal(harness.polledTaskIds.length, 0);
  assert.equal(harness.refunds.length, 1);
  assert.equal(harness.events.length, 1);
  assert.equal(harness.events[0]?.status, JobStatus.Failed);
  assert.equal(harness.events[0]?.errorMessage, harness.refunds[0]);
});

test("decodes a base64 image without invoking the URL downloader", async () => {
  const harness = createImageFailureHarness({
    response: {
      model: "seedream-5-0-lite-260128",
      created: 1_777_000_000,
      data: [
        {
          b64_json: Buffer.from([10, 11, 12]).toString("base64"),
          size: "4K",
        },
      ],
    },
  });

  await createGenerationProcessor(harness.dependencies)("image-job");

  assert.equal(harness.imageCalls(), 1);
  assert.equal(harness.downloadCalls(), 0);
  assert.equal(harness.pollCalls(), 0);
  assert.deepEqual(Array.from(harness.uploads[0]?.body ?? []), [10, 11, 12]);
  assert.equal(harness.uploads[0]?.contentType, "image/png");
  assert.equal(harness.events.at(-1)?.status, JobStatus.Complete);
});

test("provider exceptions refund once without publishing raw details", async () => {
  const harness = createImageFailureHarness({
    createError: new Error("raw upstream credential-adjacent detail"),
  });

  await createGenerationProcessor(harness.dependencies)("image-job");

  assertSafeFailure(
    harness.refunds,
    harness.events,
    SAFE_GENERATION_FAILURE_MESSAGE,
    /credential-adjacent|raw upstream/i,
  );
  assert.deepEqual(harness.operations, [
    "db:claim",
    "publish:processing",
    "modelark:image",
    "db:refund",
    "publish:failed",
  ]);
});

test("content-filter responses refund with a safe filter message", async () => {
  const harness = createImageFailureHarness({
    response: {
      model: "seedream-5-0-lite-260128",
      created: 1_777_000_000,
      data: [],
      error: {
        code: "content_filter_rejected",
        message: "raw moderation payload detail",
      },
    },
  });

  await createGenerationProcessor(harness.dependencies)("image-job");

  assertSafeFailure(
    harness.refunds,
    harness.events,
    SAFE_CONTENT_FILTER_MESSAGE,
    /raw moderation|payload detail/i,
  );
});

test("a rejected input image is reported as an image problem, not a prompt problem", async () => {
  // Real BytePlus response, 2026-08-29. The word "Sensitive" in the code would
  // otherwise match the content-filter test and tell the user to reword a
  // prompt that was never the problem.
  const harness = createImageFailureHarness({
    response: {
      model: "seedream-5-0-lite-260128",
      created: 1_777_000_000,
      data: [],
      error: {
        code: "InputImageSensitiveContentDetected.PrivacyInformation",
        message:
          "The request failed because the input image 'content[1]' may contain real person.",
      },
    },
  });

  await createGenerationProcessor(harness.dependencies)("image-job");

  assertSafeFailure(
    harness.refunds,
    harness.events,
    SAFE_INPUT_IMAGE_REJECTED_MESSAGE,
    /content\[1\]|PrivacyInformation/i,
  );
});

test("missing generated media refunds once", async () => {
  const harness = createImageFailureHarness({
    response: {
      model: "seedream-5-0-lite-260128",
      created: 1_777_000_000,
      data: [{ size: "4K" }],
    },
  });

  await createGenerationProcessor(harness.dependencies)("image-job");

  assertSafeFailure(
    harness.refunds,
    harness.events,
    SAFE_GENERATION_FAILURE_MESSAGE,
  );
});

for (const [name, options] of [
  ["download", { downloadError: new Error("private download failure") }],
  ["storage", { storageError: new Error("private TOS failure") }],
  ["completion", { completionError: new Error("private database failure") }],
] as const) {
  test(`${name} failure refunds once and publishes a safe message`, async () => {
    const harness = createImageFailureHarness(options);

    await createGenerationProcessor(harness.dependencies)("image-job");

    assertSafeFailure(
      harness.refunds,
      harness.events,
      SAFE_GENERATION_FAILURE_MESSAGE,
      /private|TOS|database/i,
    );
  });
}

test("video polling timeout refunds once and publishes a safe message", async () => {
  const harness = createVideoHarness(videoJob(), {
    pollError: new ModelArkTimeoutError("modelark-task-1", 60_000),
  });

  await createGenerationProcessor(harness.dependencies)("video-job");

  assertSafeFailure(
    harness.refunds,
    harness.events,
    SAFE_TIMEOUT_MESSAGE,
    /modelark-task|60000/i,
  );
});

test("an empty created video task ID refunds before persistence or polling", async () => {
  const harness = createVideoHarness(videoJob(), { createdTaskId: "" });

  await createGenerationProcessor(harness.dependencies)("video-job");

  assert.equal(harness.polledTaskIds.length, 0);
  assert.equal(
    harness.operations.some((operation) => operation.startsWith("db:save-task:")),
    false,
  );
  assertSafeFailure(
    harness.refunds,
    harness.events,
    SAFE_GENERATION_FAILURE_MESSAGE,
  );
});

for (const status of ["failed", "cancelled"] as const) {
  test(`video provider status ${status} refunds once`, async () => {
    const providerResult = videoResponse(status);
    if (status === "failed") {
      providerResult.error = {
        code: "provider_terminal_failure",
        message: "raw terminal provider detail",
      };
    }
    const harness = createVideoHarness(videoJob(), {
      pollResult: providerResult,
    });

    await createGenerationProcessor(harness.dependencies)("video-job");

    assertSafeFailure(
      harness.refunds,
      harness.events,
      SAFE_GENERATION_FAILURE_MESSAGE,
      status === "failed" ? /raw terminal|provider_terminal/i : undefined,
    );
  });
}

test("a succeeded video without a URL refunds once", async () => {
  const harness = createVideoHarness(videoJob(), {
    pollResult: videoResponse("succeeded", ""),
  });

  await createGenerationProcessor(harness.dependencies)("video-job");

  assertSafeFailure(
    harness.refunds,
    harness.events,
    SAFE_GENERATION_FAILURE_MESSAGE,
  );
});

test("a standard voice job calls createSpeech, not createAudioGeneration", async () => {
  let currentJob = voiceJob("standard");
  const operations: string[] = [];
  const events: JobStatusEvent[] = [];
  const dependencies: GenerationProcessorDependencies = {
    loadJob: async () => currentJob,
    claimQueuedJob: async () => {
      currentJob = { ...currentJob, status: "processing" };
      return true;
    },
    failAndRefund: async () => {
      throw new Error("happy path must not refund");
    },
    saveExternalTaskId: async () => {
      throw new Error("voice flow must not save a video task ID");
    },
    completeJobWithAssets: async (_jobId, assetInputs) => {
      currentJob = { ...currentJob, status: "complete" };
      return {
        job: currentJob,
        assets: assetInputs.map((assetInput, index) => ({
          id: index === 0 ? "audio-asset-1" : `audio-asset-1-${index + 1}`,
          jobId: currentJob.id,
          userId: currentJob.userId,
          type: assetInput.type,
          storageUrl: assetInput.storageUrl,
          thumbnailUrl: null,
          createdAt: FIXED_TIME,
        })),
      };
    },
    modelArk: {
      createImage: async () => {
        throw new Error("voice flow must not call modelArk");
      },
      createVideoTask: async () => {
        throw new Error("voice flow must not call modelArk");
      },
      pollVideoTaskUntilDone: async () => {
        throw new Error("voice flow must not call modelArk");
      },
    },
    voice: {
      createSpeech: async (request) => {
        operations.push("voice:createSpeech");
        assert.equal(request.req_params.text, "welcome to the show");
        return { audio: Uint8Array.from([1, 2, 3]), contentType: "audio/mpeg" };
      },
      createAudioGeneration: async () => {
        throw new Error("standard voice must not call createAudioGeneration");
      },
    },
    download: async () => {
      throw new Error("voice flow must not download");
    },
    storage: {
      upload: async (input) => {
        operations.push(`storage:upload:${input.type}`);
        return "tos://assets/user-1/voice-job/audio.mp3";
      },
    },
    publish: async (event) => {
      operations.push(`publish:${event.status}`);
      events.push(event);
    },
    loadInputAssets: async () => [],
    signAssetUrl: async (storageUrl) => `https://signed.example/${storageUrl}`,
  };

  await createGenerationProcessor(dependencies)("voice-job");

  assert.deepEqual(operations, [
    "publish:processing",
    "voice:createSpeech",
    "storage:upload:audio",
    "publish:complete",
  ]);
  assert.equal(events.at(-1)?.assets?.[0]?.type, "audio");
});

test("an expressive voice job calls createAudioGeneration, not createSpeech", async () => {
  let currentJob = voiceJob("expressive");
  const operations: string[] = [];
  const events: JobStatusEvent[] = [];
  const dependencies: GenerationProcessorDependencies = {
    loadJob: async () => currentJob,
    claimQueuedJob: async () => {
      currentJob = { ...currentJob, status: "processing" };
      return true;
    },
    failAndRefund: async () => {
      throw new Error("happy path must not refund");
    },
    saveExternalTaskId: async () => {
      throw new Error("voice flow must not save a video task ID");
    },
    completeJobWithAssets: async (_jobId, assetInputs) => {
      currentJob = { ...currentJob, status: "complete" };
      return {
        job: currentJob,
        assets: assetInputs.map((assetInput, index) => ({
          id: index === 0 ? "audio-asset-2" : `audio-asset-2-${index + 1}`,
          jobId: currentJob.id,
          userId: currentJob.userId,
          type: assetInput.type,
          storageUrl: assetInput.storageUrl,
          thumbnailUrl: null,
          createdAt: FIXED_TIME,
        })),
      };
    },
    modelArk: {
      createImage: async () => {
        throw new Error("voice flow must not call modelArk");
      },
      createVideoTask: async () => {
        throw new Error("voice flow must not call modelArk");
      },
      pollVideoTaskUntilDone: async () => {
        throw new Error("voice flow must not call modelArk");
      },
    },
    voice: {
      createSpeech: async () => {
        throw new Error("expressive voice must not call createSpeech");
      },
      createAudioGeneration: async (request) => {
        operations.push("voice:createAudioGeneration");
        assert.equal(request.model, "seed-audio-1.0");
        assert.equal(request.text_prompt, "welcome to the show");
        assert.deepEqual(request.audio_config, { format: "mp3", sample_rate: 48000 });
        return { audio: Uint8Array.from([4, 5, 6]), contentType: "audio/mpeg" };
      },
    },
    download: async () => {
      throw new Error("voice flow must not download");
    },
    storage: {
      upload: async (input) => {
        operations.push(`storage:upload:${input.type}`);
        return "tos://assets/user-1/voice-job/audio.mp3";
      },
    },
    publish: async (event) => {
      operations.push(`publish:${event.status}`);
      events.push(event);
    },
    loadInputAssets: async () => [],
    signAssetUrl: async (storageUrl) => `https://signed.example/${storageUrl}`,
  };

  await createGenerationProcessor(dependencies)("voice-job");

  assert.deepEqual(operations, [
    "publish:processing",
    "voice:createAudioGeneration",
    "storage:upload:audio",
    "publish:complete",
  ]);
  assert.equal(events.at(-1)?.assets?.[0]?.type, "audio");
});

// --- Image-to-video (C2) ----------------------------------------------------
// Confirmed contract (MODELARK_API_REFERENCE.md R2): same endpoint as
// text-to-video, with extra image_url items in content[], optionally carrying a
// role of "first_frame" or "last_frame".

function inputAsset(
  assetId: string,
  role: "first_frame" | "last_frame" | "reference" | "source_video",
  type: "image" | "video" | "audio" = "image",
) {
  return {
    assetId,
    role,
    position: 0,
    storageUrl: `tos://bucket/${assetId}.png`,
    type,
  } as const;
}

test("a video job with no input assets sends text only, as before", async () => {
  const harness = createVideoHarness(videoJob());

  await createGenerationProcessor(harness.dependencies)("video-job");

  assert.deepEqual(harness.createRequests[0]?.content, [
    { type: "text", text: "orbital sunrise" },
  ]);
});

test("a first-frame input asset is signed and appended with its role", async () => {
  const harness = createVideoHarness(videoJob());
  harness.dependencies.loadInputAssets = async () => [
    inputAsset("still-1", "first_frame"),
  ];

  await createGenerationProcessor(harness.dependencies)("video-job");

  assert.deepEqual(harness.createRequests[0]?.content, [
    { type: "text", text: "orbital sunrise" },
    {
      type: "image_url",
      image_url: { url: "https://signed.example/tos://bucket/still-1.png" },
      role: "first_frame",
    },
  ]);
});

test("first and last frames are both sent, each with its own role", async () => {
  const harness = createVideoHarness(videoJob());
  harness.dependencies.loadInputAssets = async () => [
    inputAsset("start", "first_frame"),
    inputAsset("end", "last_frame"),
  ];

  await createGenerationProcessor(harness.dependencies)("video-job");

  const content = harness.createRequests[0]?.content ?? [];
  assert.equal(content.length, 3);
  assert.equal(content[1]?.role, "first_frame");
  assert.equal(content[2]?.role, "last_frame");
});

test("a reference image is roled reference_image, not left unroled", async () => {
  const harness = createVideoHarness(videoJob());
  harness.dependencies.loadInputAssets = async () => [
    inputAsset("ref-1", "reference"),
  ];

  await createGenerationProcessor(harness.dependencies)("video-job");

  // R4: an image with no role is read by the provider as a first frame, so
  // omitting the role does not mean "no role" — it silently means "keyframe".
  const imageItem = harness.createRequests[0]?.content[1];
  assert.equal(imageItem?.type, "image_url");
  assert.equal(imageItem?.role, "reference_image");
});

test("keyframe roles pass through unchanged", async () => {
  const harness = createVideoHarness(videoJob());
  harness.dependencies.loadInputAssets = async () => [
    inputAsset("start", "first_frame"),
    inputAsset("end", "last_frame"),
  ];

  await createGenerationProcessor(harness.dependencies)("video-job");

  assert.deepEqual(
    harness.createRequests[0]?.content.slice(1).map((item) => item.role),
    ["first_frame", "last_frame"],
  );
});

test("private tos:// URLs are never sent to the provider unsigned", async () => {
  const harness = createVideoHarness(videoJob());
  harness.dependencies.loadInputAssets = async () => [
    inputAsset("still-1", "first_frame"),
  ];

  await createGenerationProcessor(harness.dependencies)("video-job");

  const serialized = JSON.stringify(harness.createRequests[0]);
  assert.doesNotMatch(serialized, /"tos:\/\//);
});

test("a source video is sent as a roled video_url item", async () => {
  const harness = createVideoHarness(videoJob());
  harness.dependencies.loadInputAssets = async () => [
    inputAsset("clip-1", "source_video", "video"),
  ];

  await createGenerationProcessor(harness.dependencies)("video-job");

  const item = harness.createRequests[0]?.content[1];
  assert.equal(item?.type, "video_url");
  assert.equal(item?.role, "reference_video");
  assert.equal(item?.image_url, undefined);
});

test("extend order is preserved, so [Video 1] in the prompt means the first clip", async () => {
  const harness = createVideoHarness(videoJob());
  harness.dependencies.loadInputAssets = async () => [
    inputAsset("clip-1", "source_video", "video"),
    inputAsset("clip-2", "source_video", "video"),
  ];

  await createGenerationProcessor(harness.dependencies)("video-job");

  assert.deepEqual(
    harness.createRequests[0]?.content.slice(1).map((item) => item.video_url?.url),
    [
      "https://signed.example/tos://bucket/clip-1.png",
      "https://signed.example/tos://bucket/clip-2.png",
    ],
  );
});

test("audio input assets are skipped rather than sent in an unconfirmed shape", async () => {
  const harness = createVideoHarness(videoJob());
  harness.dependencies.loadInputAssets = async () => [
    inputAsset("voice-1", "reference", "audio"),
  ];

  await createGenerationProcessor(harness.dependencies)("video-job");

  // reference_audio is documented but unexercised; sending a guessed shape
  // mid-generation would fail after the user was already charged.
  assert.deepEqual(harness.createRequests[0]?.content, [
    { type: "text", text: "orbital sunrise" },
  ]);
});

test("a resumed video job does not re-sign or re-send input assets", async () => {
  const harness = createVideoHarness(videoJob("processing", "modelark-task-1"));
  let loadCalls = 0;
  harness.dependencies.loadInputAssets = async () => {
    loadCalls += 1;
    return [inputAsset("still-1", "first_frame")];
  };

  await createGenerationProcessor(harness.dependencies)("video-job");

  // Resume polls the existing task; recreating it would double-charge upstream.
  assert.equal(harness.createRequests.length, 0);
  assert.equal(loadCalls, 0);
});

// --- Multi-reference image-to-image (C4) ------------------------------------
// Confirmed contract (MODELARK_API_REFERENCE.md R3): same /images/generations
// endpoint, with an `image` array of reference URLs. Order is meaningful --
// prompts address references as "image 1", "image 2".

test("an image job with no references omits the image field entirely", async () => {
  const harness = createImageFailureHarness({});

  await createGenerationProcessor(harness.dependencies)("image-job");

  assert.equal("image" in (harness.imageRequests()[0] ?? {}), false);
});

test("reference assets are signed and passed as an ordered image array", async () => {
  const harness = createImageFailureHarness({});
  harness.dependencies.loadInputAssets = async () => [
    { assetId: "ref-a", role: "reference", position: 0, storageUrl: "tos://b/a.png", type: "image" },
    { assetId: "ref-b", role: "reference", position: 1, storageUrl: "tos://b/b.png", type: "image" },
  ];

  await createGenerationProcessor(harness.dependencies)("image-job");

  assert.deepEqual(harness.imageRequests()[0]?.image, [
    "https://signed.example/tos://b/a.png",
    "https://signed.example/tos://b/b.png",
  ]);
});

test("private tos:// URLs are never sent as image references unsigned", async () => {
  const harness = createImageFailureHarness({});
  harness.dependencies.loadInputAssets = async () => [
    { assetId: "ref-a", role: "reference", position: 0, storageUrl: "tos://b/a.png", type: "image" },
  ];

  await createGenerationProcessor(harness.dependencies)("image-job");

  assert.doesNotMatch(JSON.stringify(harness.imageRequests()[0]), /"tos:\/\//);
});

function createImageHarness({
  count = 1,
  returned,
}: { count?: number; returned?: number } = {}) {
  let currentJob: JobRecord = {
    ...imageJob(),
    creditsCost: count,
    inputParams: {
      prompt: "portrait in dramatic light",
      params: { type: "image", size: "4K", count },
    },
  };
  const createRequests: GenerateImagesRequest[] = [];
  const uploads: StorageUploadInput[] = [];
  const events: JobStatusEvent[] = [];
  const imageCount = returned ?? count;

  const dependencies: GenerationProcessorDependencies = {
    loadJob: async () => currentJob,
    claimQueuedJob: async () => {
      currentJob = { ...currentJob, status: "processing" };
      return true;
    },
    failAndRefund: async () => {
      throw new Error("batch happy path must not refund");
    },
    saveExternalTaskId: async () => {
      throw new Error("image flow must not save a video task ID");
    },
    completeJobWithAssets: async (_jobId, assetInputs) => {
      currentJob = { ...currentJob, status: "complete" };
      return {
        job: currentJob,
        assets: assetInputs.map((assetInput, index) => ({
          id: `asset-${index + 1}`,
          jobId: currentJob.id,
          userId: currentJob.userId,
          type: assetInput.type,
          storageUrl: assetInput.storageUrl,
          thumbnailUrl: null,
          createdAt: FIXED_TIME,
        })),
      };
    },
    modelArk: {
      createImage: async (request) => {
        createRequests.push(request);
        return {
          model: "seedream-5-0-lite-260128",
          created: 1_777_000_000,
          data: Array.from({ length: imageCount }, (_, index) => ({
            url: `https://modelark.example/image-${index + 1}.png`,
            size: "4K",
          })),
        };
      },
      createVideoTask: async () => {
        throw new Error("image flow must not create a video task");
      },
      pollVideoTaskUntilDone: async () => {
        throw new Error("image flow must not poll");
      },
    },
    voice: {
      createSpeech: async () => {
        throw new Error("image flow must not call voice");
      },
      createAudioGeneration: async () => {
        throw new Error("image flow must not call voice");
      },
    },
    download: async () => ({
      body: Uint8Array.from([1, 2, 3]),
      contentType: "image/png",
    }),
    storage: {
      upload: async (input) => {
        uploads.push(input);
        return `tos://assets/user-1/image-job/${uploads.length}.png`;
      },
    },
    publish: async (event) => {
      events.push(event);
    },
    loadInputAssets: async () => [],
    signAssetUrl: async (storageUrl) => `https://signed.example/${storageUrl}`,
  };

  return { dependencies, createRequests, uploads, events };
}

// --- Batch image generation (C9) --------------------------------------------
// Confirmed contract (MODELARK_API_REFERENCE.md R9): sequential_image_generation
// "auto" turns batch on; max_images is a ceiling, not a quantity.

test("a count of one sends no batch fields at all", async () => {
  const harness = createImageHarness();

  await createGenerationProcessor(harness.dependencies)("image-job");

  const request = harness.createRequests[0] as unknown as Record<string, unknown>;
  assert.equal("sequential_image_generation" in request, false);
  assert.equal("sequential_image_generation_options" in request, false);
});

test("a batch request asks for exactly the requested count", async () => {
  const harness = createImageHarness({ count: 4 });

  await createGenerationProcessor(harness.dependencies)("image-job");

  const request = harness.createRequests[0] as unknown as Record<string, unknown>;
  assert.equal(request.sequential_image_generation, "auto");
  assert.deepEqual(request.sequential_image_generation_options, { max_images: 4 });
});

test("every returned image becomes its own asset and reaches the client", async () => {
  const harness = createImageHarness({ count: 3, returned: 3 });

  await createGenerationProcessor(harness.dependencies)("image-job");

  const completeEvent = harness.events.at(-1);
  assert.equal(completeEvent?.assets?.length, 3);
  assert.equal(harness.uploads.length, 3);
});

test("a short batch completes with what came back rather than failing", async () => {
  // max_images is a ceiling; fewer images is a normal response, not an error.
  const harness = createImageHarness({ count: 5, returned: 2 });

  await createGenerationProcessor(harness.dependencies)("image-job");

  const completeEvent = harness.events.at(-1);
  assert.equal(completeEvent?.status, "complete");
  assert.equal(completeEvent?.assets?.length, 2);
});

// --- 3D generation (C8) -----------------------------------------------------
// Confirmed contract (MODELARK_API_REFERENCE.md R5): the video task endpoint,
// settings as CLI flags inside the prompt text, file under content.file_url.

function model3dJob(status: JobRecord["status"] = "queued"): JobRecord {
  return {
    id: "model3d-job",
    userId: "user-1",
    type: "model3d",
    model: "hyper3d-gen2-260112",
    status,
    inputParams: {
      prompt: "a wooden chair",
      params: { type: "model3d", quality: "high" },
    },
    externalTaskId: null,
    errorMessage: null,
    creditsCost: 40,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
  };
}

function create3dHarness(fileUrl = "https://provider.example/mesh.glb") {
  let currentJob = model3dJob();
  const createRequests: CreateContentGenerationTaskRequest[] = [];
  const uploads: StorageUploadInput[] = [];
  const events: JobStatusEvent[] = [];
  const savedTaskIds: string[] = [];

  const dependencies: GenerationProcessorDependencies = {
    loadJob: async () => currentJob,
    claimQueuedJob: async () => {
      currentJob = { ...currentJob, status: "processing" };
      return true;
    },
    failAndRefund: async () => {
      throw new Error("3D happy path must not refund");
    },
    saveExternalTaskId: async (_jobId, taskId) => {
      savedTaskIds.push(taskId);
      currentJob = { ...currentJob, externalTaskId: taskId };
    },
    completeJobWithAssets: async (_jobId, assetInputs) => {
      currentJob = { ...currentJob, status: "complete" };
      return {
        job: currentJob,
        assets: assetInputs.map((assetInput) => ({
          id: "mesh-asset-1",
          jobId: currentJob.id,
          userId: currentJob.userId,
          type: assetInput.type,
          storageUrl: assetInput.storageUrl,
          thumbnailUrl: null,
          createdAt: FIXED_TIME,
        })),
      };
    },
    modelArk: {
      createImage: async () => {
        throw new Error("3D flow must not call image generation");
      },
      createVideoTask: async (request) => {
        createRequests.push(request);
        return { id: "cgt-3d-1" };
      },
      pollVideoTaskUntilDone: async () => ({
        id: "cgt-3d-1",
        model: "hyper3d-gen2-260112",
        status: "succeeded" as const,
        content: { video_url: "", last_frame_url: "", file_url: fileUrl },
        created_at: 1,
        updated_at: 2,
      }),
    },
    voice: {
      createSpeech: async () => {
        throw new Error("3D flow must not call voice");
      },
      createAudioGeneration: async () => {
        throw new Error("3D flow must not call voice");
      },
    },
    download: async () => ({
      body: Uint8Array.from([0x67, 0x6c, 0x54, 0x46]),
      contentType: "binary/octet-stream",
    }),
    storage: {
      upload: async (input) => {
        uploads.push(input);
        return "tos://assets/user-1/model3d-job/mesh.glb";
      },
    },
    publish: async (event) => {
      events.push(event);
    },
    loadInputAssets: async () => [],
    signAssetUrl: async (storageUrl) => `https://signed.example/${storageUrl}`,
  };

  return { dependencies, createRequests, uploads, events, savedTaskIds };
}

test("3D settings ride inside the prompt text as CLI flags, not as JSON fields", async () => {
  const harness = create3dHarness();

  await createGenerationProcessor(harness.dependencies)("model3d-job");

  const request = harness.createRequests[0];
  assert.equal(request?.model, "hyper3d-gen2-260112");
  // "high" is the 1,000,000-polygon preset.
  assert.equal(
    request?.content[0]?.text,
    "a wooden chair --material PBR --quality_override 1000000",
  );
  // Nothing 3D-specific may leak into the JSON body — the provider has no such
  // fields and would reject or ignore them.
  assert.equal("quality" in (request ?? {}), false);
});

test("the task ID is persisted before polling, so a crash does not double-charge", async () => {
  const harness = create3dHarness();

  await createGenerationProcessor(harness.dependencies)("model3d-job");

  assert.deepEqual(harness.savedTaskIds, ["cgt-3d-1"]);
});

test("the mesh is taken from content.file_url and stored as a model3d asset", async () => {
  const harness = create3dHarness();

  await createGenerationProcessor(harness.dependencies)("model3d-job");

  // video_url is empty on a 3D task; reading it instead would silently fail.
  assert.equal(harness.uploads[0]?.type, "model3d");
  assert.equal(harness.events.at(-1)?.status, "complete");
  assert.equal(harness.events.at(-1)?.assets?.[0]?.type, "model3d");
});

test("a 3D task with no file URL fails rather than completing empty", async () => {
  const harness = create3dHarness("");

  await assert.rejects(async () => {
    // failAndRefund throws in this harness, so the refund path surfaces here.
    await createGenerationProcessor(harness.dependencies)("model3d-job");
  });
});

test("an attached image becomes an image-to-3D input, unroled", async () => {
  const harness = create3dHarness();
  harness.dependencies.loadInputAssets = async () => [
    inputAsset("photo-1", "reference"),
  ];

  await createGenerationProcessor(harness.dependencies)("model3d-job");

  const item = harness.createRequests[0]?.content[1];
  assert.equal(item?.type, "image_url");
  // 3D has no keyframe concept, so there is no role to name. The confirmed
  // sample sends the image bare.
  assert.equal(item?.role, undefined);
  assert.match(item?.image_url?.url ?? "", /^https:\/\/signed\.example\//);
});

test("a 3D job skips non-image inputs rather than guessing a shape", async () => {
  const harness = create3dHarness();
  harness.dependencies.loadInputAssets = async () => [
    inputAsset("clip-1", "source_video", "video"),
  ];

  await createGenerationProcessor(harness.dependencies)("model3d-job");

  assert.equal(harness.createRequests[0]?.content.length, 1);
});

// --- Failure classification ordering ----------------------------------------
// Each branch overlaps the next in wording, so the order they are tested in is
// the behaviour. These assert the classification a user would act on, not the
// raw provider text.

function classify(code: string, message: string) {
  return createImageFailureHarness({
    response: {
      model: "seedream-5-0-lite-260128",
      created: 1_777_000_000,
      data: [],
      error: { code, message },
    },
  });
}

test("an unsupported setting is not reported as a prompt problem", async () => {
  // The real failure that motivated this: an image size the provider never
  // accepted read as a bare "Generation failed", so the obvious next move —
  // rewording the prompt — could never have fixed it.
  const harness = classify(
    "InvalidParameter",
    "The parameter `size` specified in the request is not valid",
  );

  await createGenerationProcessor(harness.dependencies)("image-job");

  const message = harness.events.at(-1)?.errorMessage ?? "";
  assert.match(message, /settings/i);
  assert.match(message, /prompt is not the problem/i);
});

test("quota is distinguished from a temporary refusal", async () => {
  // "quota exceeded" contains wording a rate-limit rule also matches. Telling
  // the user to wait a minute would be wrong: waiting never restores quota.
  const harness = classify("QuotaExceeded", "account quota exceeded for this model");

  await createGenerationProcessor(harness.dependencies)("image-job");

  const message = harness.events.at(-1)?.errorMessage ?? "";
  assert.match(message, /out of quota/i);
  assert.doesNotMatch(message, /wait a minute/i);
});

test("a rate limit tells the user to wait rather than to change anything", async () => {
  const harness = classify("TooManyRequests", "rate limit reached, please retry");

  await createGenerationProcessor(harness.dependencies)("image-job");

  assert.match(harness.events.at(-1)?.errorMessage ?? "", /wait a minute/i);
});

test("every failure message names a recovery, not just a failure", async () => {
  // A message that only says something failed sends the user back to the same
  // button with the same settings.
  for (const [code, detail] of [
    ["InvalidParameter", "size is not valid"],
    ["QuotaExceeded", "quota exceeded"],
    ["TooManyRequests", "rate limit"],
    ["Timeout", "deadline exceeded"],
    ["content_filter_rejected", "moderation"],
    ["Unknown", "something else entirely"],
  ] as const) {
    const harness = classify(code, detail);
    await createGenerationProcessor(harness.dependencies)("image-job");

    const message = harness.events.at(-1)?.errorMessage ?? "";
    assert.match(message, /refunded/i, code);
    assert.match(
      message,
      /try|wait|use a different|topped up|rewording|shorter|lower/i,
      `${code} must tell the user what to do next`,
    );
  }
});
