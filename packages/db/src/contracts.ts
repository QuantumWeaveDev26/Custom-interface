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

export type PhaseOneJobType = "image" | "video";
export type JobStatus = "queued" | "processing" | "complete" | "failed";
export type AssetType = PhaseOneJobType;

export interface JobRecord {
  id: string;
  userId: string;
  type: PhaseOneJobType;
  model: string;
  status: JobStatus;
  inputParams: { prompt: string };
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

export interface SubmitJobCommand {
  userId: string;
  type: PhaseOneJobType;
  prompt: string;
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
        inputParams: { prompt: string };
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
  };
}

export interface DatabaseStore extends DatabaseTransaction {
  transaction<T>(
    operation: (tx: DatabaseTransaction) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T>;
}
