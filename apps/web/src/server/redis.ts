import Redis from "ioredis";

function redisUrl(): string {
  return process.env.REDIS_URL || "redis://localhost:6379";
}

let publisherInstance: Redis | null = null;

export function getPublisher(): Redis {
  if (publisherInstance === null) {
    publisherInstance = new Redis(redisUrl(), { maxRetriesPerRequest: null });
  }
  return publisherInstance;
}

export function createSubscriber(): Redis {
  return new Redis(redisUrl(), { maxRetriesPerRequest: null });
}
