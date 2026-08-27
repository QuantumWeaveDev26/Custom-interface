import { ModelArkHttpError, ModelArkTimeoutError } from "./errors.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  CreateContentGenerationTaskRequest,
  CreateContentGenerationTaskResponse,
  GenerateImagesRequest,
  GetContentGenerationTaskResponse,
  ImagesResponse,
  ListContentGenerationTasksFilter,
  ListContentGenerationTasksResponse,
} from "./types.js";

const DEFAULT_BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";
const DEFAULT_POLL_INTERVAL_MS = 10_000;
const DEFAULT_POLL_TIMEOUT_MS = 10 * 60 * 1_000;

export interface ModelArkClientConfig {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface PollVideoTaskOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

export interface ModelArkClient {
  createImage(params: GenerateImagesRequest): Promise<ImagesResponse>;
  createVideoTask(
    params: CreateContentGenerationTaskRequest,
  ): Promise<CreateContentGenerationTaskResponse>;
  getVideoTask(taskId: string): Promise<GetContentGenerationTaskResponse>;
  listVideoTasks(
    filter?: ListContentGenerationTasksFilter,
    pageNum?: number,
    pageSize?: number,
  ): Promise<ListContentGenerationTasksResponse>;
  deleteVideoTask(taskId: string): Promise<void>;
  pollVideoTaskUntilDone(
    taskId: string,
    options?: PollVideoTaskOptions,
  ): Promise<GetContentGenerationTaskResponse>;
  createChatCompletion(
    params: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse>;
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function createModelArkClient(config: ModelArkClientConfig): ModelArkClient {
  const apiKey = config.apiKey.trim();
  if (apiKey.length === 0) {
    throw new Error("ARK_API_KEY is not set");
  }

  const fetchImplementation = config.fetch ?? globalThis.fetch;
  if (fetchImplementation === undefined) {
    throw new Error("ModelArk client requires a fetch implementation");
  }

  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const now = config.now ?? Date.now;
  const sleep = config.sleep ?? defaultSleep;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  async function request(
    operation: string,
    path: string,
    init: RequestInit,
  ): Promise<Response> {
    const response = await fetchImplementation(`${baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      const responseBody = (await response.text()).slice(0, 1_000);
      throw new ModelArkHttpError(operation, response.status, responseBody);
    }

    return response;
  }

  async function requestJson<T>(
    operation: string,
    path: string,
    init: RequestInit,
  ): Promise<T> {
    const response = await request(operation, path, init);
    return (await response.json()) as T;
  }

  async function createImage(
    params: GenerateImagesRequest,
  ): Promise<ImagesResponse> {
    return requestJson<ImagesResponse>("createImage", "/images/generations", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async function createVideoTask(
    params: CreateContentGenerationTaskRequest,
  ): Promise<CreateContentGenerationTaskResponse> {
    return requestJson<CreateContentGenerationTaskResponse>(
      "createVideoTask",
      "/contents/generations/tasks",
      {
        method: "POST",
        body: JSON.stringify(params),
      },
    );
  }

  async function getVideoTask(
    taskId: string,
  ): Promise<GetContentGenerationTaskResponse> {
    return requestJson<GetContentGenerationTaskResponse>(
      "getVideoTask",
      `/contents/generations/tasks/${encodeURIComponent(taskId)}`,
      { method: "GET" },
    );
  }

  async function listVideoTasks(
    filter?: ListContentGenerationTasksFilter,
    pageNum = 1,
    pageSize = 20,
  ): Promise<ListContentGenerationTasksResponse> {
    const query = new URLSearchParams({
      page_num: String(pageNum),
      page_size: String(pageSize),
    });

    if (filter?.status !== undefined) {
      query.set("filter.status", filter.status);
    }
    if (filter?.model !== undefined) {
      query.set("filter.model", filter.model);
    }
    if (filter?.service_tier !== undefined) {
      query.set("filter.service_tier", filter.service_tier);
    }
    for (const taskId of filter?.task_ids ?? []) {
      query.append("filter.task_ids", taskId);
    }

    return requestJson<ListContentGenerationTasksResponse>(
      "listVideoTasks",
      `/contents/generations/tasks?${query.toString()}`,
      { method: "GET" },
    );
  }

  async function deleteVideoTask(taskId: string): Promise<void> {
    await request(
      "deleteVideoTask",
      `/contents/generations/tasks/${encodeURIComponent(taskId)}`,
      { method: "DELETE" },
    );
  }

  async function pollVideoTaskUntilDone(
    taskId: string,
    options: PollVideoTaskOptions = {},
  ): Promise<GetContentGenerationTaskResponse> {
    const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const timeoutMs = options.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
    const startedAt = now();

    while (now() - startedAt < timeoutMs) {
      const task = await getVideoTask(taskId);
      if (
        task.status === "succeeded" ||
        task.status === "failed" ||
        task.status === "cancelled"
      ) {
        return task;
      }
      await sleep(intervalMs);
    }

    throw new ModelArkTimeoutError(taskId, timeoutMs);
  }

  async function createChatCompletion(
    params: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse> {
    return requestJson<ChatCompletionResponse>(
      "createChatCompletion",
      "/chat/completions",
      {
        method: "POST",
        body: JSON.stringify(params),
      },
    );
  }

  return {
    createImage,
    createVideoTask,
    getVideoTask,
    listVideoTasks,
    deleteVideoTask,
    pollVideoTaskUntilDone,
    createChatCompletion,
  };
}
