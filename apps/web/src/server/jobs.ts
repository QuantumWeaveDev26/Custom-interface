import {
  submitJob as dbSubmitJob,
  failAndRefund,
  prismaStore,
  type SubmitJobResult,
} from "@creative-ai/db";
import {
  InvalidJobRequest,
  assertParamsSupportedByModel,
  creditCostFor,
  generationJobOptions,
  parseSubmitJobRequest,
} from "@creative-ai/shared-types";
import { getQueue } from "./queue";
import {
  CREDIT_PRICING,
  IMAGE_MODEL,
  MAX_IN_FLIGHT_JOBS,
  VIDEO_MODEL,
  VOICE_MODEL,
} from "./config";

const MODEL_BY_TYPE = {
  image: IMAGE_MODEL,
  video: VIDEO_MODEL,
  voice: VOICE_MODEL,
} as const;

export async function submitGenerationJob(
  userId: string,
  request: unknown,
): Promise<SubmitJobResult> {
  // Shape validation. Rethrown as-is so the route can surface the specific
  // reason -- a generic "invalid request" makes parameter errors undebuggable
  // for the client.
  const parsedRequest = parseSubmitJobRequest(request);

  // Model comes from server config, never the client.
  const model = MODEL_BY_TYPE[parsedRequest.type];

  // Model-aware validation: a resolution or duration the configured model does
  // not support is rejected before any credits move.
  assertParamsSupportedByModel(parsedRequest.params, model);

  // Cost is derived from the parameters actually requested, then persisted on
  // the job row so a later pricing change never alters this job's refund value.
  const creditsCost = creditCostFor(parsedRequest.params, CREDIT_PRICING);

  const jobRecord = await dbSubmitJob(prismaStore, {
    userId,
    type: parsedRequest.type,
    prompt: parsedRequest.prompt,
    params: parsedRequest.params,
    inputAssets: parsedRequest.inputAssets,
    model,
    creditsCost,
    maxInFlight: MAX_IN_FLIGHT_JOBS,
  });

  const queue = getQueue();
  try {
    await queue.add("generate", { jobId: jobRecord.job.id }, generationJobOptions(jobRecord.job.id));
  } catch (error) {
    // If enqueueing fails, compensate.
    await failAndRefund(prismaStore, jobRecord.job.id, "Submission failed. Your credits have been refunded.");
    throw error;
  }

  return jobRecord;
}

export { InvalidJobRequest };
