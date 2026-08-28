import type {
  GenerationParams,
  InputAssetRole,
  JobInputAssetRef,
} from "@creative-ai/shared-types";

export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  emailVerified: Date | null;
  image: string | null;
  creditBalance: number;
  createdAt: Date;
}

export interface CreditLedgerRecord {
  id: string;
  userId: string;
  delta: number;
  reason: string;
  createdAt: Date;
}

export interface AuthUserInput {
  email: string | null;
  name: string | null;
  emailVerified: Date | null;
  image: string | null;
}

export interface WelcomeGrantTransaction {
  user: {
    create(args: {
      data: Omit<AuthUserInput, "email"> & {
        email: string;
        creditBalance: number;
      };
    }): Promise<UserRecord>;
  };
  creditLedgerEntry: {
    create(args: {
      data: {
        userId: string;
        delta: number;
        reason: string;
      };
    }): Promise<CreditLedgerRecord>;
  };
}

export type PhaseOneJobType = "image" | "video" | "voice";
export type JobStatus = "queued" | "processing" | "complete" | "failed";
// A voice job produces an "audio" asset, not a "voice" one -- the job describes the
// generation type, the asset describes the resulting media format. Genuinely different
// sets, not a type alias.
export type AssetType = "image" | "video" | "audio";

/** What a job was actually asked to generate. Persisted, never recomputed. */
export interface JobInputParams {
  prompt: string;
  params: GenerationParams;
}

export interface JobRecord {
  id: string;
  userId: string;
  type: PhaseOneJobType;
  model: string;
  status: JobStatus;
  inputParams: JobInputParams;
  externalTaskId: string | null;
  errorMessage: string | null;
  creditsCost: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssetRecord {
  id: string;
  jobId: string;
  userId: string;
  type: AssetType;
  storageUrl: string;
  thumbnailUrl: string | null;
  createdAt: Date;
}

export interface JobInputAssetRecord {
  id: string;
  jobId: string;
  assetId: string;
  role: InputAssetRole;
  position: number;
}

/** An input asset resolved to the storage URL the worker will actually use. */
export interface ResolvedInputAsset {
  assetId: string;
  role: InputAssetRole;
  position: number;
  storageUrl: string;
  type: AssetType;
}

export class InputAssetNotOwnedError extends Error {
  constructor(public readonly assetIds: readonly string[]) {
    super(`Input assets not found or not owned by this user: ${assetIds.join(", ")}`);
    this.name = "InputAssetNotOwnedError";
  }
}

export interface SubmitJobCommand {
  userId: string;
  type: PhaseOneJobType;
  prompt: string;
  params: GenerationParams;
  /** Verified inside the submission transaction to belong to `userId`. */
  inputAssets?: readonly JobInputAssetRef[];
  model: string;
  creditsCost: number;
  maxInFlight: number;
}

export interface CreateAssetInput {
  type: AssetType;
  storageUrl: string;
  thumbnailUrl?: string | null;
}

export interface CountResult {
  count: number;
}

export interface TransactionOptions {
  isolationLevel: "Serializable";
}

export interface DatabaseTransaction extends WelcomeGrantTransaction {
  user: WelcomeGrantTransaction["user"] & {
    updateMany(args: {
      where: {
        id: string;
        creditBalance?: { gte: number };
      };
      data: {
        creditBalance: {
          decrement?: number;
          increment?: number;
        };
      };
    }): Promise<CountResult>;
  };
  job: {
    count(args: {
      where: {
        userId: string;
        status: { in: JobStatus[] };
      };
    }): Promise<number>;
    create(args: {
      data: {
        userId: string;
        type: PhaseOneJobType;
        model: string;
        status: "queued";
        inputParams: JobInputParams;
        creditsCost: number;
      };
    }): Promise<JobRecord>;
    updateMany(args: {
      where: {
        id: string;
        status?: JobStatus | { in: JobStatus[] };
      };
      data: {
        status?: JobStatus;
        errorMessage?: string | null;
        externalTaskId?: string | null;
      };
    }): Promise<CountResult>;
    findUnique(args: { where: { id: string } }): Promise<JobRecord | null>;
    findMany(args: {
      where: {
        status: "queued";
        createdAt: { lte: Date };
      };
      orderBy: { createdAt: "asc" };
      take: number;
    }): Promise<JobRecord[]>;
  };
  asset: {
    create(args: {
      data: {
        jobId: string;
        userId: string;
        type: AssetType;
        storageUrl: string;
        thumbnailUrl?: string | null;
      };
    }): Promise<AssetRecord>;
    // Ownership filter is part of the query, not an afterthought: a caller
    // cannot accidentally read another user's assets through this contract.
    findMany(args: {
      where: { id: { in: string[] }; userId: string };
    }): Promise<AssetRecord[]>;
  };
  jobInputAsset: {
    createMany(args: {
      data: Array<{
        jobId: string;
        assetId: string;
        role: InputAssetRole;
        position: number;
      }>;
    }): Promise<CountResult>;
    findMany(args: {
      where: { jobId: string };
      orderBy: { position: "asc" };
    }): Promise<JobInputAssetRecord[]>;
  };
}

export interface DatabaseStore extends DatabaseTransaction {
  transaction<T>(
    operation: (tx: DatabaseTransaction) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T>;
}
