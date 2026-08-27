import type { JobRecord } from "@creative-ai/db";
import {
  generationJobOptions,
  type GenerationJobPayload,
} from "@creative-ai/shared-types";

const RECOVERY_AGE_MILLISECONDS = 60_000;
const RECOVERY_BATCH_LIMIT = 100;
export const GENERATION_JOB_NAME = "generate";

export interface RecoveryQueue {
  getJob(jobId: string): Promise<unknown | null>;
  add(
    name: typeof GENERATION_JOB_NAME,
    data: GenerationJobPayload,
    options: ReturnType<typeof generationJobOptions>,
  ): Promise<unknown>;
}

export interface QueuedJobRecoveryDependencies {
  findStaleQueuedJobs(cutoffTime: Date, limit: number): Promise<JobRecord[]>;
  queue: RecoveryQueue;
  logError?: (error: unknown, jobId: string) => void;
}

export interface RecoveryResult {
  inspected: number;
  requeued: number;
  errors: number;
}

export async function runQueuedJobRecovery(
  dependencies: QueuedJobRecoveryDependencies,
  now = new Date(),
): Promise<RecoveryResult> {
  const cutoffTime = new Date(now.getTime() - RECOVERY_AGE_MILLISECONDS);
  const jobs = await dependencies.findStaleQueuedJobs(
    cutoffTime,
    RECOVERY_BATCH_LIMIT,
  );
  const result: RecoveryResult = {
    inspected: jobs.length,
    requeued: 0,
    errors: 0,
  };

  for (const job of jobs) {
    try {
      const existing = await dependencies.queue.getJob(job.id);
      if (existing !== null && existing !== undefined) continue;

      await dependencies.queue.add(
        GENERATION_JOB_NAME,
        { jobId: job.id },
        generationJobOptions(job.id),
      );
      result.requeued += 1;
    } catch (error) {
      result.errors += 1;
      if (dependencies.logError) {
        dependencies.logError(error, job.id);
      } else {
        console.error("Queued-job recovery failed", { jobId: job.id, error });
      }
    }
  }

  return result;
}

