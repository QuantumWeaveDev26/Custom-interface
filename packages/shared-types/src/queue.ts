export const GENERATION_QUEUE_NAME = "generation";

export type GenerationJobPayload = {
  jobId: string;
};

export function generationJobOptions(jobId: string): { jobId: string; attempts: 1 } {
  return { jobId, attempts: 1 };
}
