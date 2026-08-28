import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "./client.js";
import type {
  AssetType,
  DatabaseStore,
  DatabaseTransaction,
  JobStatus,
  PhaseOneJobType,
} from "./contracts.js";

type PrismaDelegateClient = Prisma.TransactionClient | PrismaClient;

function toDatabaseTransaction(
  client: PrismaDelegateClient,
): DatabaseTransaction {
  return {
    user: {
      create: async ({ data }) => client.user.create({ data }),
      updateMany: async ({ where, data }) => {
        const creditBalance: Prisma.IntFieldUpdateOperationsInput = {};
        if (data.creditBalance.decrement !== undefined) {
          creditBalance.decrement = data.creditBalance.decrement;
        }
        if (data.creditBalance.increment !== undefined) {
          creditBalance.increment = data.creditBalance.increment;
        }
        return client.user.updateMany({
          where: {
            id: where.id,
            ...(where.creditBalance === undefined
              ? {}
              : { creditBalance: { gte: where.creditBalance.gte } }),
          },
          data: { creditBalance },
        });
      },
    },
    creditLedgerEntry: {
      create: async ({ data }) => client.creditLedgerEntry.create({ data }),
    },
    job: {
      count: async ({ where }) =>
        client.job.count({
          where: {
            userId: where.userId,
            status: { in: where.status.in },
          },
        }),
      create: async ({ data }) => {
        const job = await client.job.create({
          data: {
            ...data,
            inputParams: data.inputParams as Prisma.InputJsonValue,
          },
        });
        return {
          ...job,
          type: job.type as PhaseOneJobType,
          status: job.status as JobStatus,
          inputParams: job.inputParams as { prompt: string; voiceStyle?: "standard" | "expressive" },
        };
      },
      updateMany: async ({ where, data }) => {
        const updateData: Prisma.JobUpdateManyMutationInput = {};
        if (data.status !== undefined) updateData.status = data.status;
        if (data.errorMessage !== undefined) {
          updateData.errorMessage = data.errorMessage;
        }
        if (data.externalTaskId !== undefined) {
          updateData.externalTaskId = data.externalTaskId;
        }
        return client.job.updateMany({
          where: {
            id: where.id,
            ...(where.status === undefined
              ? {}
              : {
                  status:
                    typeof where.status === "string"
                      ? where.status
                      : { in: where.status.in },
                }),
          },
          data: updateData,
        });
      },
      findUnique: async ({ where }) => {
        const job = await client.job.findUnique({ where });
        return job === null
          ? null
          : {
              ...job,
              type: job.type as PhaseOneJobType,
              status: job.status as JobStatus,
              inputParams: job.inputParams as { prompt: string; voiceStyle?: "standard" | "expressive" },
            };
      },
      findMany: async ({ where, orderBy, take }) => {
        const jobs = await client.job.findMany({ where, orderBy, take });
        return jobs.map((job) => ({
          ...job,
          type: job.type as PhaseOneJobType,
          status: job.status as JobStatus,
          inputParams: job.inputParams as { prompt: string; voiceStyle?: "standard" | "expressive" },
        }));
      },
    },
    asset: {
      create: async ({ data }) => {
        const asset = await client.asset.create({
          data: {
            jobId: data.jobId,
            userId: data.userId,
            type: data.type,
            storageUrl: data.storageUrl,
            ...(data.thumbnailUrl === undefined
              ? {}
              : { thumbnailUrl: data.thumbnailUrl }),
          },
        });
        return {
          ...asset,
          type: asset.type as AssetType,
        };
      },
    },
  };
}

export function createPrismaStore(client: PrismaClient): DatabaseStore {
  const direct = toDatabaseTransaction(client);
  return {
    ...direct,
    transaction: async (operation, options) => {
      if (options === undefined) {
        return client.$transaction(async (tx) =>
          operation(toDatabaseTransaction(tx)),
        );
      }
      return client.$transaction(
        async (tx) => operation(toDatabaseTransaction(tx)),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    },
  };
}

export const prismaStore = createPrismaStore(prisma);
