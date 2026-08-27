# Phase 1 Core Monorepo Design

## Goal

Build the Phase 1 creative-AI product described in `ARCHITECTURE.md`: authenticated users receive a welcome credit grant, submit image or video prompts, observe queued work over SSE, and view completed TOS-backed assets in a private gallery. The implementation is a pnpm/Turborepo monorepo rooted at `D:\office\claude-custom`.

## Scope

Phase 1 includes:

- Auth.js v5 with Resend email magic links and Google OAuth.
- PostgreSQL and Prisma for Auth.js records, users, credits, jobs, and assets.
- BullMQ and Redis for queued generation work and status pub/sub.
- A standalone TypeScript worker.
- Synchronous ModelArk image generation and asynchronous ModelArk video generation.
- Private BytePlus TOS storage using `@volcengine/tos-sdk`.
- A basic Next.js Studio and authenticated asset gallery.
- A lightweight recovery sweep for the database-commit/queue-enqueue crash window.

Phase 1 does not create the prompt library, agents, Director, marketing workflow, voice, avatar, billing, admin, public community gallery, or ECS deployment tooling described for later phases. The repo will not scaffold `packages/prompt-library`, `packages/agents`, or `infra/ecs` yet.

## Repository Layout

```text
apps/
  web/                 Next.js 15 App Router UI and thin route handlers
  worker/              BullMQ consumer and queued-job recovery sweep
packages/
  db/                  Prisma schema/client and transactional domain operations
  modelark-client/     Typed ModelArk HTTP client
  shared-types/        Phase 1 job, asset, API, and event contracts
infra/
  docker-compose.yml   Local PostgreSQL 16 and Redis 7
docs/superpowers/      Approved design and implementation plan
```

The supplied root-level `schema.prisma`, `modelark-client.ts`, and `docker-compose.yml` seed files move into their final locations. `ARCHITECTURE.md`, `MODELARK_API_REFERENCE.md`, and `.env.example` remain at the root.

## Dependencies

Runtime dependencies stay within the approved stack:

- Next.js 15, React, TypeScript, and Tailwind CSS.
- Prisma and `@prisma/client`.
- Auth.js v5 (`next-auth`) and `@auth/prisma-adapter`.
- BullMQ and its Redis client (`ioredis`) for the queue and explicit pub/sub.
- `@volcengine/tos-sdk` configured with explicit BytePlus region and endpoint.

Tests use Node's built-in test runner. No separate validation, test, state-management, component-library, WebSocket, or outbox dependency is added.

## Configuration

The root environment contract includes:

```dotenv
ARK_API_KEY=
ARK_BASE_URL=https://ark.ap-southeast.bytepluses.com/api/v3
MODELARK_IMAGE_MODEL=seedream-5-0-lite-260128
MODELARK_VIDEO_MODEL=dreamina-seedance-2-0-fast-260128
DATABASE_URL=postgresql://app:app@localhost:5432/custom_interface
REDIS_URL=redis://localhost:6379
TOS_ACCESS_KEY=
TOS_SECRET_KEY=
TOS_BUCKET=
TOS_REGION=ap-southeast-1
TOS_ENDPOINT=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
AUTH_RESEND_KEY=
AUTH_EMAIL_FROM=noreply@yourdomain.com
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
INITIAL_CREDITS=100
IMAGE_CREDITS_COST=1
VIDEO_CREDITS_COST=14
MAX_IN_FLIGHT_JOBS=3
```

Model selection is server-only. Job-submission request types contain no `model` field, and the API ignores/rejects unknown fields rather than allowing a model override. The active image model and image credit cost form one configuration pair; the active video model and video credit cost form another. The checked-in development video pair is Seedance 2.0 Fast and 14 credits. Switching the default to Seedance 2.5 requires changing the model and cost to approximately 87 credits in the same change.

## Data Model and Auth

The Prisma schema uses the supplied Phase 1 models plus the approved Auth.js adapter models. `User.email` remains required. `User` includes `name`, `emailVerified`, `image`, `accounts`, and `sessions`; `Account`, `Session`, and `VerificationToken` retain the adapter's expected names and fields.

`packages/db` exports one Prisma client and focused transactional operations. Auth configuration wraps the Prisma adapter's `createUser` operation so a new user, the `INITIAL_CREDITS` balance, and a positive `CreditLedgerEntry` with `reason: "welcome_grant"` are created in one database transaction. A paid top-up remains distinguishable with `reason: "topup"` for future billing work.

## Submission Contract and Transaction

`POST /api/jobs` requires an Auth.js session and accepts one of these closed request shapes:

```ts
type SubmitImageJob = {
  type: "image";
  prompt: string;
};

type SubmitVideoJob = {
  type: "video";
  prompt: string;
};
```

The server trims prompts, rejects empty or excessively long values, rejects unsupported types and unknown fields, and constructs the ModelArk request itself. No browser-provided model, resolution, ratio, duration, image size, output format, credit cost, user ID, status, external task ID, or storage location is accepted.

Flat Phase 1 credit costs are calibrated to one immutable server-side generation profile per type:

- Image: one Seedream 5.0 Lite image, `size: "4K"`, `output_format: "png"`, `response_format: "url"`, `watermark: false`, and sequential generation disabled.
- Video: Seedance 2.0 Fast, five seconds, `720p`, `21:9`, with all other provider options left at the same defaults used by the reference cost observation.

These settings are constants in server-only worker configuration, not environment variables or request fields. If Phase 1 pricing or output settings change, the corresponding settings, model, and credit cost must change together. Custom generation settings require a future per-profile or per-model cost table and are outside Phase 1.

The server resolves the model and cost from the corresponding environment pair. A serializable database transaction then:

1. Counts the user's `queued` and `processing` jobs and rejects when the count is already `MAX_IN_FLIGHT_JOBS` (default three).
2. Atomically decrements the balance only when enough credits remain.
3. Creates the `queued` job with the resolved model and immutable `creditsCost`.
4. Creates the negative ledger entry with `reason: "generation:<jobId>"`.

Serializable-conflict errors are retried a small bounded number of times. Other failures return stable HTTP error responses without enqueueing.

After commit, the route adds a BullMQ entry whose BullMQ `jobId` equals the database job ID and whose explicit `attempts` option is `1`. If enqueueing throws synchronously, a compensating database transaction changes the still-queued job to `failed`, restores its stored `creditsCost`, and creates `reason: "refund:<jobId>"`. The compensation is conditional and idempotent so it cannot refund twice.

## Crash-Window Recovery Sweep

The synchronous compensation cannot cover a process exit between database commit and queue insertion. The standalone worker therefore runs a lightweight interval every 30 seconds:

1. Select a bounded batch of database jobs still `queued`, older than 60 seconds.
2. Ask BullMQ for the entry using the database ID as BullMQ `jobId`.
3. Re-enqueue the database job only when the queue entry is absent.

BullMQ's stable job ID makes concurrent sweeps idempotent. A transient Redis error is logged and left for the next sweep; it does not cause a refund. This sweep is a safety net inside the existing worker, not an outbox, scheduler service, or new subsystem.

## ModelArk Client

`packages/modelark-client` starts from the supplied skeleton and keeps all ModelArk HTTP details server-side. It exposes a client factory receiving API key, base URL, fetch implementation, clock, and sleeper where relevant, rather than reading credentials and throwing during module import. This makes configuration explicit and tests deterministic.

Confirmed endpoints are:

- `POST /images/generations` for synchronous image generation.
- `POST /contents/generations/tasks` to create an asynchronous video task.
- `GET /contents/generations/tasks/:id` to retrieve a task.
- `GET /contents/generations/tasks` with the SDK-confirmed `filter.*` query names to list tasks.
- `DELETE /contents/generations/tasks/:id` to cancel/delete a task.

HTTP errors include the operation, status, and a bounded response message without exposing authorization headers. The poller returns only on `succeeded`, `failed`, or `cancelled`, uses injected timing for tests, and raises a distinct timeout error.

Phase 2 chat-completion code is removed from the Phase 1 package rather than shipped dormant.

## Worker Flow

The BullMQ payload contains only the database job ID. The processor reloads and authorizes all work from the database, then publishes job-specific events only after corresponding database commits.

For image jobs:

1. Atomically claim the job by changing `queued` to `processing`, then publish that state.
2. Call `createImage` exactly once; image generation does not poll.
3. Reject a response-level ModelArk error or missing output.
4. Download the returned URL or decode returned base64.
5. Upload the bytes to TOS and persist the asset.
6. Mark the job `complete` and publish its asset summary.

For video jobs:

1. Attempt to claim a queued job atomically by changing it to `processing`; a successful claim publishes that state and is allowed to create one provider task.
2. After a successful claim, create the video task and persist its ID immediately.
3. When the claim does not succeed because a recovered job is already `processing`, resume only if `externalTaskId` is present; otherwise fail/refund the ambiguous job without creating a provider task.
4. Map ModelArk `queued` and `running` to internal processing, `succeeded` to completion, and `failed` or `cancelled` to failure.
5. Download and upload the successful `video_url`, persist the asset, complete the job, and publish the result.

Because generation calls incur real cost, BullMQ does not blindly recreate paid work. Every enqueued generation job explicitly uses `attempts: 1`, which disables ordinary automatic retries. BullMQ can still recover a stalled active job after a worker crash, so the database claim is the second no-replay guard: a recovered image job that finds the database job already `processing` must fail and refund without calling `createImage` again. A recovered video job may resume only when `externalTaskId` is already durable; a `processing` video job without an external ID is ambiguous and must fail/refund rather than create a possibly duplicate provider task.

Any terminal ModelArk error, content-filter rejection, timeout, download failure, or storage failure uses one conditional transaction to mark the job failed and refund the job's stored cost once. The UI receives a safe user-facing message; detailed server errors remain in logs.

## TOS Storage and Asset Access

The worker creates `TosClient` with `TOS_ACCESS_KEY`, `TOS_SECRET_KEY`, `TOS_REGION`, and `TOS_ENDPOINT`; it never relies on a China-region package default. Objects use keys scoped by user and job. The database stores a `tos://<bucket>/<key>` URL, which preserves an unambiguous bucket/key without requiring the bucket to be public.

An authenticated `GET /api/assets/:id` route verifies asset ownership, generates a short-lived signed TOS URL, and redirects to it. Browser code receives neither TOS credentials nor a permanently public object address.

## Status Events and SSE

Worker events publish JSON to a channel derived from the database job ID. `GET /api/jobs/:id/stream`:

1. Requires authentication and confirms the job belongs to the session user.
2. Creates a dedicated Redis subscriber and subscribes before reading the current database snapshot.
3. Emits the snapshot as the initial SSE event, preventing a transition between snapshot and subscription from being lost.
4. Forwards later job events and emits periodic SSE comments as heartbeats.
5. Cleans up the Redis subscription when the request aborts or reaches a terminal state.

The event contract contains job ID, status, safe error message, and completed asset summaries. It contains no credentials, raw provider response, or other user's data.

## Web Experience

Unauthenticated users see a sign-in page with email magic link as the primary action and Google OAuth as the alternative. Authenticated users see:

- Current credit balance.
- Image/video mode selection.
- Prompt input; Phase 1 exposes no output-setting controls.
- The server-resolved model label as informational text, never as an editable or submitted field.
- Submission feedback and live queued/processing/complete/failed status.
- The completed result when SSE reports an asset.
- A private gallery of the current user's image and video assets.

The UI is intentionally basic and responsive. It adds no camera presets, Director tools, marketing workflow, voice/avatar controls, billing controls, admin features, or public sharing.

## Error Handling and Idempotency

- Authentication failures return 401; ownership failures return 404 to avoid leaking IDs.
- Invalid input returns 400 with field-safe messages.
- Insufficient credits returns 402; the in-flight limit returns 429.
- Submission transactions prevent negative balances and count races.
- Queue insertion compensation and worker refunds are conditional on current job state.
- Refund amount always comes from `Job.creditsCost`, never current environment configuration.
- BullMQ job IDs and persisted video task IDs prevent duplicate queue entries and duplicate video creation.
- Redis publication occurs after database state is durable; the database snapshot remains the source of truth if a pub/sub event is missed.

## Testing and Verification

Implementation follows test-first red/green/refactor cycles. Tests compile with TypeScript and run through Node's built-in test runner. Injected ports/fakes cover behavior without adding a test framework:

- ModelArk routes, authentication headers, query names, synchronous image behavior, asynchronous terminal polling, errors, and timeouts.
- Welcome-grant atomicity and required-email handling.
- Submission validation, prompt-only closed request shapes, server-only model resolution, immutable generation profiles, cost/model/profile pair defaults, in-flight enforcement, insufficient balance, ledger reasons, explicit BullMQ `attempts: 1`, enqueue compensation, and idempotent refund.
- Worker image flow without polling, atomic claim and no-replay behavior after an image stall, video create-then-poll, video resume only with a persisted external task ID, ambiguous video no-recreate behavior, TOS persistence, content-filter failure, and refund-once behavior.
- Recovery sweep age threshold, queue-presence check, stable job ID, re-enqueue, and transient Redis behavior.
- SSE subscribe-before-snapshot ordering, ownership, initial state, forwarded state, terminal cleanup, and heartbeat formatting.

Final verification runs dependency installation, Prisma formatting/validation/generation, all tests, TypeScript checks, Turbo tasks, and a production Next.js build. Compose configuration is created and inspected, but PostgreSQL/Redis containers cannot be started on the current machine because Docker is unavailable. Live ModelArk, Resend, Google, and TOS calls require user credentials and are not invoked by automated tests.
