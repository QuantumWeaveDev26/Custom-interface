import { createModelArkClient } from "@creative-ai/modelark-client";
import { createVoiceClient } from "@creative-ai/voice-client";
import {
  claimQueuedJob,
  completeJobWithAsset,
  failAndRefund,
  findStaleQueuedJobs,
  prismaStore,
  saveExternalTaskId,
} from "@creative-ai/db";
import {
  GENERATION_QUEUE_NAME,
  type GenerationJobPayload,
} from "@creative-ai/shared-types";
import { TosClient } from "@volcengine/tos-sdk";
import { Queue, Worker, type Job } from "bullmq";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import Redis from "ioredis";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RedisType = any;

import { createGenerationProcessor } from "./processor.js";
import { createTosStorage } from "./storage.js";
import { runQueuedJobRecovery } from "./recovery.js";

export interface WorkerRuntimeConfig {
  queueName?: string;
  redisUrl: string;
  modelArkApiKey: string;
  modelArkBaseUrl: string;
  tosAccessKey: string;
  tosSecretKey: string;
  tosRegion: string;
  tosEndpoint: string;
  tosBucket: string;
  imageModel: string;
  videoModel: string;
  voiceApiKey: string;
  voiceBaseUrl: string;
}

export interface WorkerRuntime {
  queue: Queue<GenerationJobPayload>;
  worker: Worker<GenerationJobPayload>;
  shutdown(): Promise<void>;
}

async function downloadUrl(url: string): Promise<{
  body: Uint8Array;
  contentType: string;
}> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  const contentType =
    response.headers.get("content-type") || "application/octet-stream";
  const body = new Uint8Array(await response.arrayBuffer());
  return { body, contentType };
}

function createRedisConnection(url: string): RedisType {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
  const connection = new (Redis as any)(url, {
    retryStrategy: (times: number) => Math.min(times * 50, 2000),
    maxRetriesPerRequest: null,
  }) as RedisType;
  return connection;
}

export async function createWorkerRuntime(
  config: WorkerRuntimeConfig,
): Promise<WorkerRuntime> {
  const queueName = config.queueName || GENERATION_QUEUE_NAME;

  // Create Redis connections for BullMQ
  const redis = createRedisConnection(config.redisUrl);
  const redisSubscriber = createRedisConnection(config.redisUrl);

  // Create queue for job submission tracking
  const queue = new Queue<GenerationJobPayload>(queueName, {
    connection: redis,
  });

  // Create ModelArk client
  const modelArk = createModelArkClient({
    apiKey: config.modelArkApiKey,
    baseUrl: config.modelArkBaseUrl,
    fetch,
  });

  // Create BytePlus Voice client (genuinely separate product/auth from ModelArk)
  const voice = createVoiceClient({
    apiKey: config.voiceApiKey,
    baseUrl: config.voiceBaseUrl,
    fetch,
  });

  // Create TOS storage
  const tosClient = new TosClient({
    accessKeyId: config.tosAccessKey,
    accessKeySecret: config.tosSecretKey,
    region: config.tosRegion,
    endpoint: config.tosEndpoint,
  });

  // Create adapted TOS client that matches the expected interface
  const tosStorageClient = {
    async putObject(input: {
      bucket: string;
      key: string;
      body: Uint8Array;
      contentType: string;
    }) {
      return await tosClient.putObject({
        bucket: input.bucket,
        key: input.key,
        body: Buffer.from(input.body),
        contentType: input.contentType,
      });
    },
  };

  const storage = createTosStorage({
    bucket: config.tosBucket,
    client: tosStorageClient,
  });

  // Create Redis publisher for SSE events
  const publisher = createRedisConnection(config.redisUrl);

  // Create generation processor function that works with BullMQ
  const processorFn = createGenerationProcessor({
    loadJob: async (jobId) => {
      return await prismaStore.job.findUnique({
        where: { id: jobId },
      });
    },
    claimQueuedJob: async (jobId) => {
      return await claimQueuedJob(prismaStore, jobId);
    },
    failAndRefund: async (jobId, message) => {
      return await failAndRefund(prismaStore, jobId, message);
    },
    saveExternalTaskId: async (jobId, externalTaskId) => {
      return await saveExternalTaskId(prismaStore, jobId, externalTaskId);
    },
    completeJobWithAsset: async (jobId, asset) => {
      return await completeJobWithAsset(prismaStore, jobId, asset);
    },
    modelArk: {
      createImage: modelArk.createImage.bind(modelArk),
      createVideoTask: modelArk.createVideoTask.bind(modelArk),
      pollVideoTaskUntilDone: modelArk.pollVideoTaskUntilDone.bind(modelArk),
    },
    voice: {
      createSpeech: voice.createSpeech.bind(voice),
      createAudioGeneration: voice.createAudioGeneration.bind(voice),
    },
    download: downloadUrl,
    storage,
    publish: async (event) => {
      const channel = `job:${event.jobId}`;
      await publisher.publish(channel, JSON.stringify(event));
    },
  });

  // Create BullMQ processor that adapts the generation processor
  const bullmqProcessor = async (
    job: Job<GenerationJobPayload>,
  ): Promise<void> => {
    return await processorFn(job.data.jobId);
  };

  // Create worker to process generation jobs
  const worker = new Worker<GenerationJobPayload>(queueName, bullmqProcessor, {
    connection: redisSubscriber,
    concurrency: 1,
  });

  // Set up recovery interval
  let recoveryInterval: NodeJS.Timeout | null = null;
  const startRecovery = () => {
    recoveryInterval = setInterval(async () => {
      try {
        const result = await runQueuedJobRecovery({
          findStaleQueuedJobs: async (cutoff, limit) => {
            return await findStaleQueuedJobs(prismaStore, cutoff, limit);
          },
          queue: {
            getJob: async (jobId) => {
              return await queue.getJob(jobId);
            },
            add: async (name, data, options) => {
              return await queue.add(name, data, options);
            },
          },
        });
        if (result.inspected > 0) {
          console.log("Recovery sweep completed", result);
        }
      } catch (error) {
        console.error("Recovery sweep failed", error);
      }
    }, 30_000);
  };

  startRecovery();

  const closers = [
    async () => {
      if (recoveryInterval !== null) {
        clearInterval(recoveryInterval);
      }
    },
    async () => {
      await queue.close();
    },
    async () => {
      await worker.close();
    },
    async () => {
      await redis.quit();
    },
    async () => {
      await redisSubscriber.quit();
    },
    async () => {
      await publisher.quit();
    },
  ];

  return {
    queue,
    worker,
    async shutdown() {
      for (const closer of closers) {
        try {
          await closer();
        } catch (error) {
          console.error("Error during shutdown:", error);
        }
      }
    },
  };
}
