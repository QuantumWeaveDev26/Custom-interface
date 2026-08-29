import { prismaStore } from "@creative-ai/db";
import { generationJobOptions } from "@creative-ai/shared-types";

import {
  CREDIT_PRICING,
  IMAGE_MODEL,
  MAX_IN_FLIGHT_JOBS,
  MODEL3D_MODEL,
  VIDEO_MODEL,
  VOICE_MODEL,
} from "./config";
import { getQueue } from "./queue";
import type { SubmitJobDependencies } from "./jobs";

/**
 * Composition root for job submission — the only place that wires the real
 * database, queue, and env-derived config together.
 *
 * Kept separate from `jobs.ts` so the submission logic can be unit-tested
 * without importing BullMQ, ioredis, or Prisma.
 */
export function jobDependencies(): SubmitJobDependencies {
  return {
    store: prismaStore,
    enqueue: (jobId) =>
      getQueue().add("generate", { jobId }, generationJobOptions(jobId)),
    modelByType: {
      image: IMAGE_MODEL,
      video: VIDEO_MODEL,
      voice: VOICE_MODEL,
      model3d: MODEL3D_MODEL,
    },
    pricing: CREDIT_PRICING,
    maxInFlight: MAX_IN_FLIGHT_JOBS,
  };
}
