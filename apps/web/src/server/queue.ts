import { Queue } from "bullmq";
import Redis from "ioredis";
import { GENERATION_QUEUE_NAME, type GenerationJobPayload } from "@creative-ai/shared-types";

let queueInstance: Queue<GenerationJobPayload> | null = null;

export function getQueue(): Queue<GenerationJobPayload> {
  if (queueInstance === null) {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    queueInstance = new Queue<GenerationJobPayload>(GENERATION_QUEUE_NAME, {
      connection,
    });
  }
  return queueInstance;
}
