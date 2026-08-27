import assert from "node:assert/strict";
import test from "node:test";

import { createModelArkClient } from "./client.js";
import { ModelArkHttpError, ModelArkTimeoutError } from "./errors.js";
import type {
  GetContentGenerationTaskResponse,
  ImagesResponse,
} from "./types.js";

const BASE_URL = "https://ark.example.test/api/v3";

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function asFetch(
  implementation: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>,
): typeof globalThis.fetch {
  return implementation as typeof globalThis.fetch;
}

function videoTask(
  status: GetContentGenerationTaskResponse["status"],
  overrides: Partial<GetContentGenerationTaskResponse> = {},
): GetContentGenerationTaskResponse {
  return {
    id: "task-123",
    model: "dreamina-seedance-2-0-fast-260128",
    status,
    content: {
      video_url: "https://media.example.test/video.mp4",
      last_frame_url: "https://media.example.test/frame.png",
      file_url: "https://media.example.test/video.mp4",
    },
    created_at: 1_777_000_000,
    updated_at: 1_777_000_001,
    ...overrides,
  };
}

test("factory validates configuration only when invoked", () => {
  assert.throws(
    () => createModelArkClient({ apiKey: "" }),
    /ARK_API_KEY is not set/,
  );
});

test("createImage posts to the synchronous image endpoint exactly once", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const expected: ImagesResponse = {
    model: "seedream-5-0-lite-260128",
    created: 1_777_000_000,
    data: [
      {
        url: "https://media.example.test/image.png",
        size: "4K",
      },
    ],
  };
  const client = createModelArkClient({
    apiKey: "secret-key",
    baseUrl: `${BASE_URL}/`,
    fetch: asFetch(async (input, init) => {
      calls.push({ input: String(input), ...(init === undefined ? {} : { init }) });
      return jsonResponse(expected);
    }),
  });
  const request = {
    model: "seedream-5-0-lite-260128",
    prompt: "A cinematic mountain landscape",
    size: "4K",
    response_format: "url" as const,
    output_format: "png" as const,
    watermark: false,
    sequential_image_generation: "disabled" as const,
  };

  const result = await client.createImage(request);

  assert.deepEqual(result, expected);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, `${BASE_URL}/images/generations`);
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(calls[0]?.init?.headers, {
    Authorization: "Bearer secret-key",
    "Content-Type": "application/json",
  });
  assert.equal(calls[0]?.init?.body, JSON.stringify(request));
  assert.equal("pollImageTaskUntilDone" in client, false);
});

test("createVideoTask posts to the async video task endpoint", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const client = createModelArkClient({
    apiKey: "secret-key",
    baseUrl: BASE_URL,
    fetch: asFetch(async (input, init) => {
      calls.push({ input: String(input), ...(init === undefined ? {} : { init }) });
      return jsonResponse({ id: "task-123" });
    }),
  });
  const request = {
    model: "dreamina-seedance-2-0-fast-260128",
    content: [{ type: "text" as const, text: "A tracking shot" }],
    resolution: "720p",
    ratio: "21:9",
    duration: 5,
  };

  assert.deepEqual(await client.createVideoTask(request), { id: "task-123" });
  assert.equal(calls[0]?.input, `${BASE_URL}/contents/generations/tasks`);
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(calls[0]?.init?.body, JSON.stringify(request));
});

test("getVideoTask and deleteVideoTask use the encoded task resource path", async () => {
  const calls: Array<{ input: string; method?: string }> = [];
  const client = createModelArkClient({
    apiKey: "secret-key",
    baseUrl: BASE_URL,
    fetch: asFetch(async (input, init) => {
      calls.push({ input: String(input), ...(init?.method === undefined ? {} : { method: init.method }) });
      return init?.method === "DELETE"
        ? new Response(null, { status: 204 })
        : jsonResponse(videoTask("running"));
    }),
  });

  await client.getVideoTask("task/with spaces");
  await client.deleteVideoTask("task/with spaces");

  assert.deepEqual(calls, [
    {
      input: `${BASE_URL}/contents/generations/tasks/task%2Fwith%20spaces`,
      method: "GET",
    },
    {
      input: `${BASE_URL}/contents/generations/tasks/task%2Fwith%20spaces`,
      method: "DELETE",
    },
  ]);
});

test("listVideoTasks uses confirmed filter query parameter names", async () => {
  let requestedUrl = "";
  const client = createModelArkClient({
    apiKey: "secret-key",
    baseUrl: BASE_URL,
    fetch: asFetch(async (input) => {
      requestedUrl = String(input);
      return jsonResponse({ total: 0, items: [] });
    }),
  });

  await client.listVideoTasks({
    status: "queued",
    task_ids: ["task-a", "task-b"],
    model: "dreamina-seedance-2-0-fast-260128",
    service_tier: "default",
  }, 2, 10);

  const url = new URL(requestedUrl);
  assert.equal(url.pathname, "/api/v3/contents/generations/tasks");
  assert.equal(url.searchParams.get("page_num"), "2");
  assert.equal(url.searchParams.get("page_size"), "10");
  assert.equal(url.searchParams.get("filter.status"), "queued");
  assert.deepEqual(url.searchParams.getAll("filter.task_ids"), ["task-a", "task-b"]);
  assert.equal(url.searchParams.get("filter.model"), "dreamina-seedance-2-0-fast-260128");
  assert.equal(url.searchParams.get("filter.service_tier"), "default");
  assert.equal(url.searchParams.has("status"), false);
  assert.equal(url.searchParams.has("task_ids"), false);
});

test("HTTP failures expose operation, status, and at most 1000 response characters", async () => {
  const responseBody = "x".repeat(1_500);
  const client = createModelArkClient({
    apiKey: "secret-key",
    fetch: asFetch(async () => new Response(responseBody, { status: 429 })),
  });

  await assert.rejects(
    client.createImage({ model: "image-model", prompt: "prompt" }),
    (error: unknown) => {
      assert.ok(error instanceof ModelArkHttpError);
      assert.equal(error.operation, "createImage");
      assert.equal(error.status, 429);
      assert.equal(error.responseBody, "x".repeat(1_000));
      return true;
    },
  );
});

test("pollVideoTaskUntilDone polls queued and running tasks until success", async () => {
  const responses = [videoTask("queued"), videoTask("running"), videoTask("succeeded")];
  const sleeps: number[] = [];
  const client = createModelArkClient({
    apiKey: "secret-key",
    fetch: asFetch(async () => jsonResponse(responses.shift())),
    now: () => 0,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
    },
  });

  const result = await client.pollVideoTaskUntilDone("task-123", {
    intervalMs: 250,
    timeoutMs: 10_000,
  });

  assert.equal(result.status, "succeeded");
  assert.deepEqual(sleeps, [250, 250]);
  assert.equal(responses.length, 0);
});

for (const status of ["failed", "cancelled"] as const) {
  test(`pollVideoTaskUntilDone returns immediately for ${status}`, async () => {
    let sleepCount = 0;
    const client = createModelArkClient({
      apiKey: "secret-key",
      fetch: asFetch(async () => jsonResponse(videoTask(status))),
      sleep: async () => {
        sleepCount += 1;
      },
    });

    const result = await client.pollVideoTaskUntilDone("task-123");

    assert.equal(result.status, status);
    assert.equal(sleepCount, 0);
  });
}

test("pollVideoTaskUntilDone throws a typed timeout using injected time", async () => {
  let clock = 0;
  let requestCount = 0;
  const client = createModelArkClient({
    apiKey: "secret-key",
    fetch: asFetch(async () => {
      requestCount += 1;
      return jsonResponse(videoTask("queued"));
    }),
    now: () => clock,
    sleep: async (milliseconds) => {
      clock += milliseconds;
    },
  });

  await assert.rejects(
    client.pollVideoTaskUntilDone("task-123", {
      intervalMs: 500,
      timeoutMs: 1_000,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ModelArkTimeoutError);
      assert.equal(error.taskId, "task-123");
      assert.equal(error.timeoutMs, 1_000);
      return true;
    },
  );
  assert.equal(requestCount, 2);
});

test("createChatCompletion posts to the chat completions endpoint", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const expected = {
    id: "chatcmpl-123",
    model: "seed-2-1",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: '{"shots":[]}' },
        finish_reason: "stop",
      },
    ],
  };
  const client = createModelArkClient({
    apiKey: "secret-key",
    baseUrl: BASE_URL,
    fetch: asFetch(async (input, init) => {
      calls.push({ input: String(input), ...(init === undefined ? {} : { init }) });
      return jsonResponse(expected);
    }),
  });
  const request = {
    model: "seed-2-1",
    messages: [{ role: "user" as const, content: "plan a shot" }],
  };

  const result = await client.createChatCompletion(request);

  assert.deepEqual(result, expected);
  assert.equal(calls[0]?.input, `${BASE_URL}/chat/completions`);
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(calls[0]?.init?.body, JSON.stringify(request));
});
