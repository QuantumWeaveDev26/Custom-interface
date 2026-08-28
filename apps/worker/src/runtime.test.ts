import assert from "node:assert/strict";
import test from "node:test";

import type { WorkerRuntimeConfig } from "./runtime.js";

test("WorkerRuntimeConfig type is valid", () => {
  const config: WorkerRuntimeConfig = {
    redisUrl: "redis://localhost:6379",
    modelArkApiKey: "test-key",
    modelArkBaseUrl: "https://test.example/api",
    tosAccessKey: "test-access",
    tosSecretKey: "test-secret",
    tosRegion: "test-region",
    tosEndpoint: "https://tos.example",
    tosBucket: "test-bucket",
    imageModel: "seedream-5-0-lite-260128",
    videoModel: "dreamina-seedance-2-0-fast-260128",
    voiceApiKey: "test-voice-key",
    voiceBaseUrl: "https://voice.test.example/api/v3",
  };

  assert.strictEqual(config.redisUrl, "redis://localhost:6379");
  assert.strictEqual(config.imageModel, "seedream-5-0-lite-260128");
});
