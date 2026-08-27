import { Queue } from "bullmq";
import Redis from "ioredis";
import { GENERATION_QUEUE_NAME, type GenerationJobPayload } from "@creative-ai/shared-types";

let queueInstance: Queue<GenerationJobPayload> | null = null;

export function getQueue(): Queue<GenerationJobPayload> {
  if (queueInstance === null) {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
    const redis = new (Redis as any)(redisUrl, {
      maxRetriesPerRequest: null,
    }) as any;
    queueInstance = new Queue<GenerationJobPayload>(GENERATION_QUEUE_NAME, {
      connection: redis,
    });
  }
  return queueInstance;
}
