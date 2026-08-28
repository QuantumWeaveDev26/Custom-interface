import type {
  CompleteJobResult,
  CreateAssetInput,
  JobRecord,
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
  type: "image" | "video" | "audio";
}

export interface AssetStorage {
  upload(input: StorageUploadInput): Promise<string>;
}

export interface GenerationProcessorDependencies {
  loadJob(jobId: string): Promise<JobRecord | null>;
  claimQueuedJob(jobId: string): Promise<true | null>;
  failAndRefund(jobId: string, message: string): Promise<boolean>;
  saveExternalTaskId(jobId: string, externalTaskId: string): Promise<void>;
  completeJobWithAsset(
    jobId: string,
    asset: CreateAssetInput,
  ): Promise<CompleteJobResult>;
  modelArk: Pick<
    ModelArkClient,
    "createImage" | "createVideoTask" | "pollVideoTaskUntilDone"
  >;
  voice: Pick<VoiceClient, "createSpeech">;
  download(url: string): Promise<DownloadedMedia>;
  storage: AssetStorage;
  publish(event: JobStatusEvent): Promise<void>;
}
