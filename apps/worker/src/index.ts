import { createWorkerRuntime } from "./runtime.js";

async function main() {
  const config = {
    redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
    modelArkApiKey: process.env.ARK_API_KEY || "",
    modelArkBaseUrl:
      process.env.ARK_BASE_URL || "https://ark.ap-southeast.bytepluses.com/api/v3",
    tosAccessKey: process.env.TOS_ACCESS_KEY || "",
    tosSecretKey: process.env.TOS_SECRET_KEY || "",
    tosRegion: process.env.TOS_REGION || "ap-southeast-1",
    tosEndpoint: process.env.TOS_ENDPOINT || "",
    tosBucket: process.env.TOS_BUCKET || "",
    imageModel: process.env.MODELARK_IMAGE_MODEL || "seedream-5-0-lite-260128",
    videoModel:
      process.env.MODELARK_VIDEO_MODEL || "dreamina-seedance-2-0-fast-260128",
    ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg",
    embeddingModel:
      process.env.MODELARK_EMBEDDING_MODEL || "skylark-embedding-vision-250615",
    voiceApiKey: process.env.BYTEPLUS_VOICE_API_KEY || "",
    voiceBaseUrl:
      process.env.BYTEPLUS_VOICE_BASE_URL ||
      "https://voice.ap-southeast-1.bytepluses.com/api/v3",
  };

  const runtime = await createWorkerRuntime(config);

  console.log("Worker runtime started");

  const shutdown = async () => {
    console.log("Shutting down worker...");
    await runtime.shutdown();
    console.log("Worker shut down successfully");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Failed to start worker:", error);
  process.exit(1);
});
