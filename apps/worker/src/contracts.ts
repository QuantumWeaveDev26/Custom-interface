import type {
  CompleteJobResult,
  CreateAssetInput,
  JobRecord,
  ResolvedInputAsset,
} from "@creative-ai/db";
import type { ModelArkClient } from "@creative-ai/modelark-client";
import type { JobStatusEvent } from "@creative-ai/shared-types";
import type { VoiceClient } from "@creative-ai/voice-client";

export interface DownloadedMedia {
  body: Uint8Array;
  contentType: string;
}

export interface StorageUploadInput extends DownloadedMedia {
  userId: string;
  jobId: string;
  type: "image" | "video" | "audio" | "model3d";
}

export interface AssetStorage {
  upload(input: StorageUploadInput): Promise<string>;
}

export interface GenerationProcessorDependencies {
  loadJob(jobId: string): Promise<JobRecord | null>;
  claimQueuedJob(jobId: string): Promise<true | null>;
  failAndRefund(jobId: string, message: string): Promise<boolean>;
  saveExternalTaskId(jobId: string, externalTaskId: string): Promise<void>;
  completeJobWithAssets(
    jobId: string,
    assets: readonly CreateAssetInput[],
  ): Promise<CompleteJobResult>;
  modelArk: Pick<
    ModelArkClient,
    "createImage" | "createVideoTask" | "pollVideoTaskUntilDone"
  >;
  voice: Pick<VoiceClient, "createSpeech" | "createAudioGeneration">;
  download(url: string): Promise<DownloadedMedia>;
  storage: AssetStorage;
  publish(event: JobStatusEvent): Promise<void>;
  /**
   * Input assets a job consumes (image-to-video, keyframes, references).
   * Scoped to the job's owner — see loadJobInputAssets in packages/db.
   */
  loadInputAssets(jobId: string, userId: string): Promise<ResolvedInputAsset[]>;
  /**
   * Turns a private `tos://` URL into a short-lived HTTPS URL.
   * Required because BytePlus fetches input images itself and cannot read our
   * private bucket.
   */
  signAssetUrl(storageUrl: string): Promise<string>;
}
