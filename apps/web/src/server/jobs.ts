import {
  submitJob as dbSubmitJob,
  failAndRefund,
  type DatabaseStore,
  type SubmitJobResult,
} from "@creative-ai/db";
import {
  InvalidJobRequest,
  assertParamsSupportedByModel,
  creditCostFor,
  parseSubmitJobRequest,
  type CreditPricing,
} from "@creative-ai/shared-types";
export interface SubmitJobDependencies {
  store: DatabaseStore;
  /** Only the one method used, so tests don't need a whole BullMQ Queue. */
  enqueue(jobId: string): Promise<unknown>;
  modelByType: Readonly<Record<"image" | "video" | "voice" | "model3d", string>>;
  pricing: CreditPricing;
  maxInFlight: number;
}

/**
 * Dependencies are injected rather than imported so this module stays free of
 * Redis, Postgres, and env-dependent config — the credit path is then testable
 * in isolation, matching the injectable-client pattern used by modelark-client
 * and voice-client. The composition root lives in `job-dependencies.ts`.
 */
export async function submitGenerationJob(
  userId: string,
  request: unknown,
  dependencies: SubmitJobDependencies,
): Promise<SubmitJobResult> {
  // Shape validation. Rethrown as-is so the route can surface the specific
  // reason -- a generic "invalid request" makes parameter errors undebuggable.
  const parsedRequest = parseSubmitJobRequest(request);

  // Model comes from server config, never the client.
  const model = dependencies.modelByType[parsedRequest.type];

  // A resolution or duration the configured model does not support is rejected
  // before any credits move.
  assertParamsSupportedByModel(parsedRequest.params, model);

  // Cost derives from the parameters actually requested, then is persisted on
  // the job row so a later pricing change never alters this job's refund value.
  const creditsCost = creditCostFor(parsedRequest.params, dependencies.pricing);

  const jobRecord = await dbSubmitJob(dependencies.store, {
    userId,
    type: parsedRequest.type,
    prompt: parsedRequest.prompt,
    params: parsedRequest.params,
    inputAssets: parsedRequest.inputAssets,
    model,
    creditsCost,
    maxInFlight: dependencies.maxInFlight,
  });

  try {
    await dependencies.enqueue(jobRecord.job.id);
  } catch (error) {
    // The job row and debit already committed, so a failed enqueue must
    // compensate or the user is charged for work that will never run.
    await failAndRefund(
      dependencies.store,
      jobRecord.job.id,
      "Submission failed. Your credits have been refunded.",
    );
    throw error;
  }

  return jobRecord;
}

export { InvalidJobRequest };
