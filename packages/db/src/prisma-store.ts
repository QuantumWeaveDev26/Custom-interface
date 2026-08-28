import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "./client.js";
import {
  DEFAULT_IMAGE_PARAMS,
  DEFAULT_VIDEO_PARAMS,
  type GenerationParams,
  type InputAssetRole,
} from "@creative-ai/shared-types";

import type {
  AssetType,
  DatabaseStore,
  DatabaseTransaction,
  JobInputParams,
  JobStatus,
  PhaseOneJobType,
} from "./contracts.js";

type PrismaDelegateClient = Prisma.TransactionClient | PrismaClient;

/**
 * Rows written before generation params existed store `{ prompt }` (plus, for
 * voice, a top-level `voiceStyle`) with no `params` object. The migration that
 * introduced JobInputAsset was additive and did not backfill them, so this
 * reconstructs the profile those jobs actually ran with.
 *
 * Without this, a legacy job still sitting in the queue would fail on
 * `params.type` and get refunded rather than run.
 */
function normalizeInputParams(
  raw: unknown,
  jobType: PhaseOneJobType,
): JobInputParams {
  const value = (raw ?? {}) as {
    prompt?: unknown;
    params?: unknown;
    voiceStyle?: unknown;
  };
  const prompt = typeof value.prompt === "string" ? value.prompt : "";

  if (value.params !== undefined && value.params !== null) {
    return { prompt, params: value.params as GenerationParams };
  }

  if (jobType === "image") {
    return { prompt, params: DEFAULT_IMAGE_PARAMS };
  }
  if (jobType === "video") {
    return { prompt, params: DEFAULT_VIDEO_PARAMS };
  }
  return {
    prompt,
    params: {
      type: "voice",
      style: value.voiceStyle === "expressive" ? "expressive" : "standard",
    },
  };
}

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
            // JobInputParams is a plain JSON-serializable object, but its
            // discriminated union does not structurally match Prisma's
            // InputJsonValue, so the widening is explicit.
            inputParams: data.inputParams as unknown as Prisma.InputJsonValue,
          },
        });
        return {
          ...job,
          type: job.type as PhaseOneJobType,
          status: job.status as JobStatus,
          inputParams: normalizeInputParams(job.inputParams, job.type as PhaseOneJobType),
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
              inputParams: normalizeInputParams(job.inputParams, job.type as PhaseOneJobType),
            };
      },
      findMany: async ({ where, orderBy, take }) => {
        const jobs = await client.job.findMany({ where, orderBy, take });
        return jobs.map((job) => ({
          ...job,
          type: job.type as PhaseOneJobType,
          status: job.status as JobStatus,
          inputParams: normalizeInputParams(job.inputParams, job.type as PhaseOneJobType),
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
      findMany: async ({ where }) => {
        const assets = await client.asset.findMany({
          where: { id: { in: where.id.in }, userId: where.userId },
        });
        return assets.map((asset) => ({
          ...asset,
          type: asset.type as AssetType,
        }));
      },
      createUploaded: async ({ data }) => {
        const asset = await client.asset.create({
          data: {
            userId: data.userId,
            type: data.type,
            storageUrl: data.storageUrl,
          },
        });
        return { ...asset, type: asset.type as AssetType };
      },
    },
    jobInputAsset: {
      createMany: async ({ data }) =>
        client.jobInputAsset.createMany({ data }),
      findMany: async ({ where, orderBy }) => {
        const links = await client.jobInputAsset.findMany({ where, orderBy });
        return links.map((link) => ({
          ...link,
          role: link.role as InputAssetRole,
        }));
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
