# One file, two images.
#
# The web app and the worker are built from the same monorepo and share every
# dependency, so building them twice from two files would compile the same
# TypeScript twice and let the two images drift apart. The `builder` stage does
# the work once; the two runtime stages copy from it and differ only in what
# they need at run time — the worker needs ffmpeg to cut and stitch film, the
# web app does not.

# ---------------------------------------------------------------- builder ---
FROM node:22-bookworm-slim AS builder

# Prisma's query engine links against OpenSSL, which the slim image does not
# carry. Without it the client fails at run time, not build time, which is a
# much more expensive place to find out.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.19.0 --activate

WORKDIR /app

# Manifests first, source second. Dependencies change far less often than code,
# so this ordering lets Docker reuse the install layer across ordinary edits —
# the difference between a thirty-second rebuild and a five-minute one.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/agents/package.json packages/agents/
COPY packages/db/package.json packages/db/
COPY packages/modelark-client/package.json packages/modelark-client/
COPY packages/prompt-library/package.json packages/prompt-library/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/voice-client/package.json packages/voice-client/
RUN pnpm install --frozen-lockfile

COPY . .

# The Prisma client is generated code, not source, so it is absent from a fresh
# checkout and must be produced before anything that imports it compiles.
RUN pnpm db:generate
RUN pnpm build

# -------------------------------------------------------------------- web ---
FROM node:22-bookworm-slim AS web

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.19.0 --activate

WORKDIR /app
COPY --from=builder /app ./

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

WORKDIR /app/apps/web
CMD ["node", "node_modules/next/dist/bin/next", "start"]

# ----------------------------------------------------------------- worker ---
FROM node:22-bookworm-slim AS worker

# ffmpeg is not an optional extra here: stitching a chain into one film and
# laying narration under it both shell out to it, and its absence surfaces as a
# job that fails after the provider has already been paid.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app ./

ENV NODE_ENV=production
ENV FFMPEG_PATH=ffmpeg

WORKDIR /app/apps/worker
CMD ["node", "dist/index.js"]

# ---------------------------------------------------------------- migrate ---
# A one-shot container. Migrations are run by exactly one process, before the
# app and the worker start, rather than by whichever of them happens to boot
# first — two processes migrating the same database at once is how a schema
# gets half-applied.
FROM node:22-bookworm-slim AS migrate

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.19.0 --activate

WORKDIR /app
COPY --from=builder /app ./

ENV NODE_ENV=production
WORKDIR /app/packages/db
CMD ["pnpm", "exec", "prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"]
