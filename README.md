# Creative AI

A Next.js + Node.js monorepo for AI generation workflows (image, video, voice,
agent-driven creative direction) powered by BytePlus ModelArk and Seed Speech,
with authentication and credit-based transactions.

## Start here

| I want to… | Read |
|---|---|
| Know what's built, verified, or blocked **right now** | **`PROJECT_STATE.md`** |
| Understand the full scope — BytePlus catalog vs Higgsfield parity | **`CAPABILITY_MAP.md`** |
| Know what to build next | **`BUILD_PLAN.md`** |
| Understand the design and the reasoning behind it | `ARCHITECTURE.md` |
| Work on image / video / chat API code | `MODELARK_API_REFERENCE.md` |
| Work on any Voice code | `MODELARK_VOICE_AVATAR_REFERENCE.md` |
| Run it locally | this file, below |

**If you are an AI agent picking this project up:** read `PROJECT_STATE.md`
first. This README's setup instructions are reliable, but treat
`PROJECT_STATE.md` as authoritative on feature status.

## Local Setup

### Prerequisites

- Node.js >= 20.19
- pnpm 11.19.0
- PostgreSQL 16
- Redis 7
- Valid API keys for: ModelArk, Resend, Google OAuth, BytePlus TOS

### Environment Configuration

`.env.example` at the repo root is the canonical reference for every variable
this project uses, but it is **not read automatically** — Next.js only loads
`.env` files from its own app directory, and the plain Node worker has no
`.env` loading unless the file exists locally. Copy it into **both** app
directories with real values (keep the two in sync):

```bash
cp .env.example apps/web/.env
cp .env.example apps/worker/.env
```

(`apps/web/.env.example` and `apps/worker/.env.example` also exist as
directory-scoped copies, trimmed to only the variables each app actually
reads, if you'd rather start from those instead.)

Fill in required values:
- `ARK_API_KEY`: ModelArk API key
- `ARK_BASE_URL`: ModelArk endpoint (default: `https://ark.ap-southeast.bytepluses.com/api/v3`)
- `MODELARK_IMAGE_MODEL`: Image model ID (default: `seedream-5-0-lite-260128`)
- `MODELARK_VIDEO_MODEL`: Video model ID (default: `dreamina-seedance-2-0-fast-260128`)
- `DATABASE_URL`: PostgreSQL connection
- `REDIS_URL`: Redis connection
- `TOS_ACCESS_KEY`, `TOS_SECRET_KEY`, `TOS_BUCKET`, `TOS_REGION`, `TOS_ENDPOINT`: BytePlus TOS config
- `AUTH_RESEND_KEY`: Resend email service API key
- `AUTH_EMAIL_FROM`: Sender email for magic links
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: Google OAuth credentials
- `NEXTAUTH_SECRET`: Random string for Auth.js (generate: `openssl rand -base64 32`)

### Database Setup

```bash
pnpm db:generate   # Generate Prisma client
pnpm db:validate   # Validate schema
```

Create PostgreSQL database:
```sql
CREATE DATABASE custom_interface;
```

Run migrations (using Prisma):
```bash
cd packages/db
npx prisma migrate deploy
```

### Development

Start local services:
```bash
docker compose -f infra/docker-compose.yml up -d  # Starts PostgreSQL and Redis
```

**Without Docker** (how the current Windows dev machine is set up): PostgreSQL
and Redis are installed natively. Redis is provided by Memurai, which runs as a
Windows service and starts on boot. PostgreSQL 18 has **no registered Windows
service**, so nothing starts it automatically — start it by hand:
```bash
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "C:/Program Files/PostgreSQL/18/data" -l "C:/Program Files/PostgreSQL/18/data/startup.log" start
```
The symptom of forgetting is the worker log filling with
`Can't reach database server at localhost:5432` while the web app still starts
normally.

Run dev servers (two terminals).

⚠️ **The worker has no watch mode. After ANY change under `apps/worker` or a
package it depends on, you must rebuild *and restart* it.** Rebuilding alone is
not enough — the old process keeps running the old code in memory, and the
symptom is silent: the feature simply does nothing while everything looks fine.
This has caused real debugging sessions on this project more than once. To
check what a running worker is actually executing, compare its start time to the
build output:

```bash
# process start time vs compiled file mtime — start time must be LATER
powershell -Command "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { $_.CommandLine -like '*dist/index.js*' } | Select ProcessId, CreationDate"
```

```bash
pnpm --filter @creative-ai/web dev                                     # Next.js on :3000
pnpm --filter @creative-ai/worker build && pnpm --filter @creative-ai/worker start  # BullMQ consumer

pnpm test           # Run all tests
pnpm typecheck      # Type validation
pnpm build          # Production build
```

Access (all pages except sign-in require auth):
- **Web UI**: http://localhost:3000
- **Sign-in**: `/sign-in` — magic link or Google OAuth
- **Studio**: `/studio` — image, video, and voice generation
- **Director**: `/director` — creative brief → shot list → video per shot
- **Marketing**: `/marketing` — product URL → ad creative direction → generation
- **Transcribe**: `/transcribe` — audio file → text (Speech-to-Text)
- **Voice Clone**: `/voice-clone` — voice sample → cloned voice *(currently
  blocked by an upstream BytePlus issue — see `PROJECT_STATE.md` §3.1)*
- **Gallery**: `/gallery` — the signed-in user's generated assets

## Architecture

### apps/web
Next.js 15 frontend + API routes:
- Auth.js v5 integration (Resend + Google OAuth)
- `/api/jobs` - Job submission with credit transactions
- `/api/jobs/:id/stream` - Server-sent events for job status
- `/api/assets/:id` - Private asset access (signed TOS URLs)
- `/api/director`, `/api/marketing` - Agent planning calls (synchronous, no
  credit charge — these are LLM planning steps, not media generation)
- `/api/transcribe`, `/api/transcribe/:requestId` - Speech-to-Text submit + poll
- `/api/voice-clone` - Voice cloning with a required consent gate
- Pages listed under "Access" above

### apps/worker
Standalone Node.js BullMQ consumer:
- Processes queued generation jobs
- Calls ModelArk image/video APIs
- Uploads outputs to BytePlus TOS
- Publishes job events via Redis pub/sub
- Periodic recovery sweep for crash-window orphans

### packages/db
Prisma + database operations:
- Auth.js adapter models (User, Account, Session, VerificationToken)
- Job, Asset, CreditLedgerEntry models
- Transactional job submission with credit guards
- Welcome grant integration

### packages/modelark-client
Typed ModelArk HTTP client:
- Image generation (POST /images/generations)
- Video task creation & polling (POST/GET /contents/generations/tasks)
- Error handling with safe user messages

### packages/voice-client
Typed BytePlus Seed Speech client — **a separate product from ModelArk**
(different host, auth header, and API key):
- Standard TTS (`tts/unidirectional`) and Expressive TTS (`tts/create`)
- Speech-to-Text submit + poll (`auc/bigmodel/*`)
- Voice cloning (`tts/voice_clone`)

### packages/agents
Director and Marketing agent logic (ModelArk chat completions), including the
URL scraper with SSRF protection used by the Marketing agent.

### packages/prompt-library
Camera-preset prompt templates used by the Director agent.

### packages/shared-types
Shared TypeScript contracts:
- Job submission & status event schemas
- Fixed generation profiles (image/video/voice output settings)
- BullMQ queue configuration
- Validation utilities

## Testing

```bash
pnpm test           # Run all test suites
pnpm typecheck      # Full repo type checking
```

Phase 1 tests cover:
- Job submission transactions
- Credit deduction & compensation
- TOS storage operations
- Job status messaging
- Recovery sweep logic
- Generation processor state machine

## Constraints

**Stack (locked)**:
- Next.js 15, React 19, TypeScript 5.9.3
- Prisma 6.19.3, Auth.js 5.0.0-beta.32
- BullMQ 6.3.1, ioredis 6.0.0
- Tailwind 4.3.3

**Models (fixed, server-side only — never client-selectable)**:
- Image: `seedream-5-0-lite-260128`, 1 credit, 4K PNG
- Video: `dreamina-seedance-2-0-fast-260128`, 14 credits, 5s 720p 21:9
- Voice: `seed-tts-2.0`, 1 credit, mp3 24kHz
- Chat (Director/Marketing agents): `dola-seed-2-1-turbo-260628`, no credit charge

⚠️ **Model ID and credit cost are coupled.** Changing a default generation model
without updating its credit cost in the same change silently mis-bills against
real BytePlus spend. See `ARCHITECTURE.md` §8 for the ratio math.

**User data**:
- `User.email` required (non-nullable)
- Welcome grant: 100 credits (configurable)
- Max in-flight jobs per user: 3 (configurable)

**Retry policy**:
- BullMQ: `attempts: 1` (no retries on generation failure)
- Database: Serializable isolation for conflict retries
- Recovery sweep: 30-second interval, 60-second stale threshold

## Git Workflow

One logical change per commit, with a message explaining *why*, not just what.
Verify before committing:

```bash
pnpm typecheck && pnpm test && pnpm build
```

Baseline as of 2026-08-28: **152 tests passing** across 8 packages.

## Not yet built

See `BUILD_PLAN.md` for the full plan and current blockers. Summary:

- **Avatar (OmniHuman)** — research only, blocked on model ID confirmation
- **Billing & subscriptions** — blocked on business decisions
- **Admin dashboard**, **public/community gallery** — not started
- **ECS deployment** — specified in `ARCHITECTURE.md` §2, `infra/` currently
  has local docker-compose only; nothing is deployed anywhere yet
- **CI** — no pipeline yet; all verification is manual and local
- **API route tests** — current web tests cover state reducers only

## Granting yourself credits (dev)

Until Phase 4 billing exists, credits can only be added with this script. It
writes the balance change and a ledger entry in one transaction, so the ledger
stays a complete audit trail:

```bash
cd packages/db
DATABASE_URL="postgresql://..." node scripts/grant-credits.mjs you@example.com 500
```

Grants are recorded with `reason: "dev_grant"`, deliberately distinct from
`"topup"` — that reason is reserved for real paid top-ups so Phase 4 revenue
reporting stays accurate (see `ARCHITECTURE.md` §8).
