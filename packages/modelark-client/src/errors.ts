export class ModelArkHttpError extends Error {
  constructor(
    public readonly operation: string,
    public readonly status: number,
    public readonly responseBody: string,
  ) {
    super(`ModelArk ${operation} failed with HTTP ${status}: ${responseBody}`);
    this.name = "ModelArkHttpError";
  }
}

export class ModelArkTimeoutError extends Error {
  constructor(
    public readonly taskId: string,
    public readonly timeoutMs: number,
  ) {
    super(`ModelArk video task ${taskId} did not finish within ${timeoutMs}ms`);
    this.name = "ModelArkTimeoutError";
  }
}
