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
import { createGenerationProcessor } from "./processor.js";

const FIXED_TIME = new Date("2026-08-27T00:00:00.000Z");

function imageJob(status: JobRecord["status"] = "queued"): JobRecord {
  return {
    id: "image-job",
    userId: "user-1",
    type: "image",
    model: "seedream-5-0-lite-260128",
    status,
    inputParams: { prompt: "portrait in dramatic light" },
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

function voiceJob(voiceStyle?: "standard" | "expressive"): JobRecord {
  return {
    id: "voice-job",
    userId: "user-1",
    type: "voice",
    model: "seed-tts-2.0",
    status: "queued",
    inputParams: {
      prompt: "welcome to the show",
      ...(voiceStyle === undefined ? {} : { voiceStyle }),
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
    inputParams: { prompt: "orbital sunrise" },
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
    completeJobWithAsset: async (_jobId, assetInput) => {
      operations.push("db:complete");
      currentJob = { ...currentJob, status: "complete" };
      return {
        job: currentJob,
        asset: {
          id: "video-asset-1",
          jobId: currentJob.id,
          userId: currentJob.userId,
          type: assetInput.type,
          storageUrl: assetInput.storageUrl,
          thumbnailUrl: assetInput.thumbnailUrl ?? null,
          createdAt: FIXED_TIME,
        },
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
} {
  let currentJob = imageJob();
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
    completeJobWithAsset: async (_jobId, assetInput) => {
      if (options.completionError !== undefined) {
        throw options.completionError;
      }
      currentJob = { ...currentJob, status: "complete" };
      return {
        job: currentJob,
        asset: {
          id: "asset-1",
          jobId: currentJob.id,
          userId: currentJob.userId,
          type: assetInput.type,
          storageUrl: assetInput.storageUrl,
          thumbnailUrl: assetInput.thumbnailUrl ?? null,
          createdAt: FIXED_TIME,
        },
      };
    },
    modelArk: {
      createImage: async () => {
        operations.push("modelark:image");
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
    completeJobWithAsset: async (_jobId, assetInput) => {
      operations.push("db:complete");
      currentJob = { ...currentJob, status: "complete" };
      const result: CompleteJobResult = {
        job: currentJob,
        asset: {
          id: "asset-1",
          jobId: currentJob.id,
          userId: currentJob.userId,
          type: assetInput.type,
          storageUrl: assetInput.storageUrl,
          thumbnailUrl: assetInput.thumbnailUrl ?? null,
          createdAt: FIXED_TIME,
        },
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
      sequential_image_generation: "disabled",
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
    completeJobWithAsset: async () => {
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
    "Generation failed. Your credits have been refunded.",
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
    "This prompt was rejected by the safety filter. Your credits have been refunded.",
    /raw moderation|payload detail/i,
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
    "Generation failed. Your credits have been refunded.",
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
      "Generation failed. Your credits have been refunded.",
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
    "Generation failed. Your credits have been refunded.",
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
    "Generation failed. Your credits have been refunded.",
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
      "Generation failed. Your credits have been refunded.",
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
    "Generation failed. Your credits have been refunded.",
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
    completeJobWithAsset: async (_jobId, assetInput) => {
      currentJob = { ...currentJob, status: "complete" };
      return {
        job: currentJob,
        asset: {
          id: "audio-asset-1",
          jobId: currentJob.id,
          userId: currentJob.userId,
          type: assetInput.type,
          storageUrl: assetInput.storageUrl,
          thumbnailUrl: null,
          createdAt: FIXED_TIME,
        },
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
    completeJobWithAsset: async (_jobId, assetInput) => {
      currentJob = { ...currentJob, status: "complete" };
      return {
        job: currentJob,
        asset: {
          id: "audio-asset-2",
          jobId: currentJob.id,
          userId: currentJob.userId,
          type: assetInput.type,
          storageUrl: assetInput.storageUrl,
          thumbnailUrl: null,
          createdAt: FIXED_TIME,
        },
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
