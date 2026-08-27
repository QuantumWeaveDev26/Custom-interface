# Custom Creative-AI Interface — Engineering Architecture Blueprint
### Codebase target: `D:\office\claude-custom`

---

## 1. Goal & Approach

Build a Higgsfield-style creative-AI web platform (image, video, voice, avatar generation, camera-style presets, a shot-planning "director," and a marketing/ad workflow), powered entirely by BytePlus ModelArk.

**This is being built in phases, not all at once.** Each phase is a working, shippable slice.

| Phase | Deliverable |
|---|---|
| **1 — Core** | Auth, credit wallet, async job pipeline, Image + Video generation studio, asset gallery |
| **2 — Director** | LLM-driven shot planner + camera-preset prompt library (Cinema Studio equivalent) |
| **3 — Studio+** | Marketing/ad workflow (URL → ad), Voice (TTS), Avatar (OmniHuman) |
| **4 — Polish** | Billing (real payments), admin dashboard, community/gallery features |

**Start with Phase 1 only.** Do not scaffold Phase 2–4 features until Phase 1 is working end-to-end.

---

## 2. Stack (locked — no ambiguity for implementation)

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js 15 (App Router)**, TypeScript, Tailwind | Chosen stack; App Router gives server components for data-heavy pages |
| Backend API | **Next.js API routes / Route Handlers** (thin) | User-facing CRUD: auth, submit job, fetch status, credits |
| Background worker | **Standalone Node.js/TypeScript service** | Long-running process; polls ModelArk, NOT servable via serverless functions |
| Queue | **BullMQ + Redis** | Battle-tested Node job queue, built for exactly this create→poll→complete pattern |
| Database | **PostgreSQL + Prisma ORM** | Relational data (users, jobs, credits, assets) with clean TS types |
| Object storage | **BytePlus TOS**, client: `@volcengine/tos-sdk` | Same network as ModelArk calls; store generated media + thumbnails. Confirmed official Node client — BytePlus TOS shares this package with Volcengine TOS, configured via explicit `region`/`endpoint` (not hardcoded to China) |
| Auth | **Auth.js (NextAuth)** — email magic link (primary) + Google OAuth | No vendor lock-in; targets a non-technical creator/marketer audience, so GitHub OAuth is deliberately not the Phase 1 default (see rationale below) |
| Real-time job updates | **Server-Sent Events (SSE)** | Simpler than WebSockets for one-directional status streaming; upgrade later if needed |
| Monorepo tooling | **pnpm workspaces + Turborepo** | Standard for Next.js + worker + shared packages |
| Frontend hosting | **Vercel** | Zero-config for Next.js, decoupled from AI compute |
| Worker + Redis + Postgres hosting | **BytePlus ECS** (ap-southeast-1) | Colocated with ModelArk for latency; consolidates AI-related billing |

---

## 3. Repo layout

```
claude-custom/
├── apps/
│   ├── web/                      # Next.js app (frontend + thin API routes)
│   └── worker/                   # Standalone Node worker (BullMQ consumer)
├── packages/
│   ├── db/                       # Prisma schema + generated client
│   ├── modelark-client/          # Typed wrapper around ModelArk REST API
│   ├── shared-types/             # Shared TS interfaces (Job, Asset, User, etc.)
│   └── prompt-library/           # Phase 2: camera-preset prompt templates
├── infra/
│   ├── docker-compose.yml        # Local Postgres + Redis for dev
│   └── ecs/                      # Deploy scripts/configs for BytePlus ECS
├── .env.example
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 4. Data model (Phase 1)

```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique // required, not nullable — both Phase 1 providers
                                  // (magic link, Google) always supply email
  name          String?
  emailVerified DateTime?
  image         String?
  createdAt     DateTime @default(now())
  creditBalance Int      @default(0)
  jobs          Job[]
  ledger        CreditLedgerEntry[]
  accounts      Account[]
  sessions      Session[]
}

// Auth.js (@auth/prisma-adapter) required models — standard adapter contract,
// field names read directly by the adapter, do not rename.
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

model CreditLedgerEntry {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  delta     Int      // positive = top-up, negative = spend
  reason    String   // "welcome_grant" | "topup" | "generation:<jobId>" | "refund:<jobId>"
                      // welcome_grant = free Phase-1 dev credits, distinct from real
                      // paid topups so Phase 4 revenue reporting stays accurate
  createdAt DateTime @default(now())
}

model Job {
  id             String   @id @default(cuid())
  userId         String
  user           User     @relation(fields: [userId], references: [id])
  type           String   // "image" | "video" | "voice" | "avatar"
  model          String   // e.g. "seedream-5-0-pro", "seedance-2-5"
  status         String   // "queued" | "processing" | "complete" | "failed"
  inputParams    Json     // prompt, refs, resolution, duration, etc.
  externalTaskId String?  // ModelArk task ID for async polling
  errorMessage   String?
  creditsCost    Int
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  assets         Asset[]
}

model Asset {
  id           String   @id @default(cuid())
  jobId        String
  job          Job      @relation(fields: [jobId], references: [id])
  userId       String
  type         String   // "image" | "video" | "audio"
  storageUrl   String   // BytePlus TOS URL
  thumbnailUrl String?
  createdAt    DateTime @default(now())
}
```

---

## 5. Core request flow (Phase 1)

```
1. User submits a prompt in the Studio UI (Next.js)
2. POST /api/jobs → Next.js route handler:
     - checks credit balance, debits credits (ledger entry)
     - creates Job row (status: "queued")
     - pushes job.id onto BullMQ queue
     - returns job.id to client immediately
3. Client opens SSE connection: GET /api/jobs/:id/stream
4. Worker (separate process) picks job off queue:
     - calls ModelArk "create task" endpoint (Seedream/Seedance)
     - updates Job.status = "processing", stores externalTaskId
     - polls ModelArk "retrieve task" endpoint on an interval until complete/failed
     - on success: downloads result, uploads to BytePlus TOS, creates Asset row
     - updates Job.status = "complete" (or "failed" + refund credits)
5. Next.js publishes status changes to the open SSE stream (via Redis pub/sub
   from worker → web, since they're separate processes)
6. Client renders the result as soon as the stream reports "complete"
```

**Why a separate worker process, not just Next.js API routes calling ModelArk directly:** ModelArk video generation tasks can take real time to complete (this is not a sub-second call). Serverless function execution limits and Vercel's request timeouts make in-request polling unreliable. The queue decouples job submission (fast, user-facing) from job execution (slow, background).

---

## 6. ModelArk integration

- Base URL: `https://ark.ap-southeast.bytepluses.com/api/v3/`
- Auth: `Authorization: Bearer $ARK_API_KEY` (server-side only — **never** expose this key to the browser; all ModelArk calls happen in the worker or in a Next.js server-only route)
- Chat/reasoning calls (Phase 2 director agent): OpenAI SDK-compatible, point the `openai` npm package's `baseURL` at ModelArk
- **Video generation is async** (create task → poll → returns `video_url` on `status: "succeeded"`). **Image generation is synchronous** (image comes back directly in the response) — don't build a poll loop for images.
- Respect ModelArk's **Content Pre-filter** — a generation can come back rejected/flagged. Design the Job status enum and UI to handle `status: "failed"` with a user-facing reason, and refund credits automatically on filter rejections.

**See `MODELARK_API_REFERENCE.md`** for the verified, field-level request/response schema for video and image generation, sourced directly from BytePlus's official open-source Go SDK type definitions (not the docs website, which is a JS SPA that doesn't fetch cleanly). `packages/modelark-client` (starter skeleton provided separately) implements this contract — treat that reference doc as ground truth over anything Codex infers on its own, and confirm the two flagged unknowns (exact URL path segments, exact model ID strings for your account) before writing tests against it.

---

## 7. Multi-agent design (Phase 2 — don't build yet, but design for it now)

Two distinct agents, both implemented as Seed 2.1 chat-completion calls with **function calling**, executed server-side:

- **Director/Shot-Planner agent** — takes a one-line creative brief, returns a structured shot list (JSON: shot description, camera preset, duration). Each shot then becomes its own Job fed into the same queue pipeline from Section 5.
- **Marketing extraction agent** (Phase 3) — given a product URL, scrapes it, extracts name/description/images, and proposes a creative direction (UGC / CGI / cinematic), then hands off to image/video generation the same way.

Both agents follow the same loop: LLM proposes a tool call → your backend executes it (calls `modelark-client` or a scraper) → result goes back to the LLM → repeat until done. Build this as a small `packages/agents` package once Phase 1 is stable — don't build it now.

---

## 8. Security & correctness notes for Phase 1

- `ARK_API_KEY` lives only in worker/server env vars — verify it's never bundled into client JS.
- Debit credits **before** enqueuing, refund on failure — never let a user's balance go negative from a race condition (wrap debit + job-create in a DB transaction).
- Rate-limit job submission per user (basic first: e.g. max N in-flight jobs per user).
- **Welcome grant** (`INITIAL_CREDITS`, default 100): grant on user creation, in the same DB transaction as the user insert — never as a separate step that could fail independently and leave a user stuck at zero. Record it with `reason: "welcome_grant"`, not `"topup"` (see Section 4). This is a Phase-1 dev/testing convenience, not a production feature — before any public launch, Phase 4 billing work needs a signup-abuse guard (email verification, rate limiting) since these credits map directly to real BytePlus spend.
- **Job credit costs** (`IMAGE_CREDITS_COST=1`, `VIDEO_CREDITS_COST=14`): stored on the `Job` row at submission time, not recomputed at refund time, so a later config change never alters a refund's value. These numbers are anchored so 1 credit ≈ $0.04 of real BytePlus spend (Seedream's actual cost) — video is priced at 14 credits because Seedance 2.0-fast actually costs ~13.5x an image (~$0.54 vs ~$0.04), not a round 10x. **This pairing is coupled to which models are set as the Phase 1 default** (Section 6): if `VIDEO_CREDITS_COST` and the active video model ever get updated independently, this stops holding. When the default video model later switches to Seedance 2.5 (~$3.46, ~86x an image), `VIDEO_CREDITS_COST` must jump to ~87 in that same change — update both together, always.
- Validate/sanitize all prompt input server-side before it reaches ModelArk.

---

## 9. Environment variables (Phase 1)

```
ARK_API_KEY=
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
TOS_ACCESS_KEY=
TOS_SECRET_KEY=
TOS_BUCKET=
TOS_REGION=
TOS_ENDPOINT=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
AUTH_RESEND_KEY=
AUTH_EMAIL_FROM=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
INITIAL_CREDITS=100
IMAGE_CREDITS_COST=1
VIDEO_CREDITS_COST=14
```

**Auth provider rationale:** email magic link + Google OAuth, not GitHub OAuth. The
audience here (creators, marketers, agencies) is largely non-technical — GitHub OAuth
is the right default for developer tools, not for this product. GitHub can be added as
a third Auth.js provider later with no rearchitecting if a developer/prosumer segment
becomes worth targeting explicitly.

---

## 10. Handoff prompt for Codex

Paste this as the opening instruction when you start working in Codex on `D:\office\claude-custom`:

> Set up a pnpm + Turborepo monorepo per the structure in ARCHITECTURE.md Section 3. Start with Phase 1 only (Section 1 table). Implement in this order: (1) `packages/db` Prisma schema from Section 4 + local docker-compose Postgres/Redis, (2) `packages/modelark-client` — use the provided `modelark-client.ts` skeleton as the starting point and MODELARK_API_REFERENCE.md as the field-level source of truth; confirm the two flagged unknowns in that doc (exact URL paths, exact model ID strings) before writing tests against it, (3) `apps/worker` BullMQ consumer implementing the flow in Section 5 — remember video generation is async (poll) but image generation is synchronous (no polling), (4) `apps/web` Next.js app with the job-submission API route, SSE status stream, and a basic Studio UI for image + video prompts. Do not implement Phase 2–4 features yet. Ask before introducing any new major dependency not listed in Section 2.
