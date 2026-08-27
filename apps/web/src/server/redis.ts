import Redis from "ioredis";

let publisherInstance: any = null;

export function getPublisher(): any {
  if (publisherInstance === null) {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
    publisherInstance = new (Redis as any)(redisUrl, {
      maxRetriesPerRequest: null,
    }) as any;
  }
  return publisherInstance;
}
