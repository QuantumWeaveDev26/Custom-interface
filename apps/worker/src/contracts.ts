import type {
  ChainProgress,
  CompleteJobResult,
  CreateAssetInput,
  JobRecord,
  ResolvedInputAsset,
} from "@creative-ai/db";
import type { ModelArkClient } from "@creative-ai/modelark-client";
import type { JobAssetSummary, JobStatusEvent } from "@creative-ai/shared-types";
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
    /** Clips delivered, when a chain stopped short of what it was priced for. */
    roundsDelivered?: number,
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
  /**
   * Records a finished round of a chained video job, and clears the task id of
   * the round it completed. Called once per round so a restart resumes rather
   * than re-renders.
   */
  saveChainProgress(jobId: string, progress: ChainProgress): Promise<void>;
  /**
   * Joins a chain's clips into one file.
   *
   * Optional: a worker wired without it still produces every clip, and the
   * chain is still correct — the user simply gets the pieces rather than the
   * cut.
   */
  stitchClips?(clips: AsyncIterable<Uint8Array>): Promise<DownloadedMedia>;
  /**
   * Lays speech over a film, with the film's own sound ducked beneath it.
   *
   * Optional for the same reason as stitching: a worker without it still runs
   * every other kind of job correctly.
   */
  narrate?(
    video: Uint8Array,
    speech: Uint8Array,
    duckOriginalTo: number,
  ): Promise<DownloadedMedia>;
  /**
   * Embeds the assets a finished job produced, if the owner has asked for it.
   *
   * Optional because indexing is not part of generating: a worker wired without
   * it still produces correct assets. It runs after the completion event has
   * already been published, so an embedding call that is slow or failing can
   * never delay the result the user is waiting for, and never fails the job.
   */
  indexCompletedAssets?(
    jobId: string,
    assets: readonly JobAssetSummary[],
  ): Promise<void>;
}
