import {
  submitJob as dbSubmitJob,
  failAndRefund,
  prismaStore,
  type SubmitJobResult,
} from "@creative-ai/db";
import {
  InvalidJobRequest,
  parseSubmitJobRequest,
  generationJobOptions,
} from "@creative-ai/shared-types";
import { getQueue } from "./queue";
import { IMAGE_MODEL, IMAGE_COST, VIDEO_MODEL, VIDEO_COST, MAX_IN_FLIGHT_JOBS } from "./config";

export async function submitGenerationJob(
  userId: string,
  request: unknown,
): Promise<SubmitJobResult> {
  // Validate and parse the request
  let parsedRequest;
  try {
    parsedRequest = parseSubmitJobRequest(request);
  } catch (error) {
    throw new InvalidJobRequest("Invalid request shape or unknown fields");
  }

  // Resolve model and cost from configuration
  const [model, cost] =
    parsedRequest.type === "image"
      ? [IMAGE_MODEL, IMAGE_COST]
      : [VIDEO_MODEL, VIDEO_COST];

  // Submit to database
  const jobRecord = await dbSubmitJob(prismaStore, {
    userId,
    type: parsedRequest.type,
    prompt: parsedRequest.prompt,
    model,
    creditsCost: cost,
    maxInFlight: MAX_IN_FLIGHT_JOBS,
  });

  // Enqueue the job
  const queue = getQueue();
  try {
    await queue.add("generate", { jobId: jobRecord.job.id }, generationJobOptions(jobRecord.job.id));
  } catch (error) {
    // If enqueueing fails, compensate
    await failAndRefund(prismaStore, jobRecord.job.id, "Submission failed. Your credits have been refunded.");
    throw error;
  }

  return jobRecord;
}
