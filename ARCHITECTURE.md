# Custom Creative-AI Interface — Engineering Architecture Blueprint
### Codebase target: `D:\office\claude-custom`

> **This is the durable design document — the "how it's built and why."**
> For current status, what's verified, and what's blocked, see
> **`PROJECT_STATE.md`**. For what to build next, see **`BUILD_PLAN.md`**.
>
> Sections here describe the system as it is *designed*. Where the original
> Phase-1 design has since been superseded by what was actually built, the
> section says so inline.

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

**Status (superseded):** the original instruction here was "Phase 1 only, do not
scaffold Phase 2–4." That has been carried out and moved past. Phases 1 and 2 are
built and verified live; Phase 3 is built except Avatar, with Voice Cloning
blocked externally; Phase 4 is not started. The phase-by-phase discipline still
holds — see `PROJECT_STATE.md` for exactly where the line currently sits.

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

Actual current layout (verified 2026-08-28):

```
claude-custom/
├── apps/
│   ├── web/                      # Next.js app (frontend + thin API routes)
│   └── worker/                   # Standalone Node worker (BullMQ consumer)
├── packages/
│   ├── db/                       # Prisma schema + generated client
│   ├── modelark-client/          # Typed wrapper around ModelArk REST API
│   ├── voice-client/             # Typed wrapper around BytePlus Voice API
│   │                             #   (separate product — see note below)
│   ├── agents/                   # Director + Marketing agent logic
│   ├── shared-types/             # Shared TS interfaces (Job, Asset, User, etc.)
│   └── prompt-library/           # Camera-preset prompt templates
├── infra/
│   └── docker-compose.yml        # Local Postgres + Redis for dev
│                                 # NOTE: ecs/ deploy configs specified in §2
│                                 # but NOT yet built — see BUILD_PLAN.md F4
├── .env.example
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

**Why `voice-client` is separate from `modelark-client`:** BytePlus Voice (Seed
Speech) is a genuinely different product from ModelArk, not a sibling endpoint —
different host (`voice.ap-southeast-1.bytepluses.com`), different auth scheme
(`x-api-key` header, not `Authorization: Bearer`), and a different API key. They
cannot share a client. See `MODELARK_VOICE_AVATAR_REFERENCE.md`.

**Client design pattern (applies to both API clients and `agents`):** all
external dependencies — `fetch`, `now`, `sleep`, ID generation — are injectable
via the factory config, so every client is unit-testable without network access
or fake timers. Follow this pattern for any new client; it is why these packages
have real test coverage.

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

### Typed contracts over these columns

The Prisma schema stores `type` and `inputParams` loosely (string / JSON).
The real contracts live in `packages/db/src/contracts.ts` and are enforced in
TypeScript:

- `PhaseOneJobType = "image" | "video" | "voice"` — what the job *generates*.
- `AssetType = "image" | "video" | "audio"` — what the result *is*.
  **These are deliberately different sets, not aliases.** A `voice` job produces
  an `audio` asset. They were briefly aliased to each other, which silently
  mistyped every voice row read back from the DB — do not re-collapse them.
- `inputParams = { prompt: string; voiceStyle?: "standard" | "expressive" }` —
  `voiceStyle` selects between the two distinct BytePlus TTS endpoints
  (`tts/unidirectional` vs `tts/create`).

`"avatar"` appears in the schema comment as a reserved future value; it is not
yet a valid `PhaseOneJobType` and no code path handles it.

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
- **Job credit costs** (`IMAGE_CREDITS_COST=1`, `VIDEO_CREDITS_COST=14`): stored on the `Job` row at submission time, not recomputed at refund time, so a later config change never alters a refund's value. These numbers are anchored so 1 credit ≈ $0.04 of real BytePlus spend (Seedream's actual cost) — video is priced at 14 credits because Seedance 2.0-fast actually costs ~13.5x an image (~$0.54 vs ~$0.04), not a round 10x. **This pairing is coupled to which models are set as the Phase 1 default** (Section 6): if `VIDEO_CREDITS_COST` and the active video model ever get updated independently, this stops holding. **That switch happened on 2026-08-31.** The default video model is now
`dreamina-seedance-2-5-260628`, and the rate moved with it in the same change:
`DEFAULT_VIDEO_CREDITS_PER_SECOND_720P` is **5.77**, derived as $3.46 per 15s at
720p ÷ $0.04 a credit ÷ 15s. A 5s/720p clip therefore costs 29 credits where it
used to cost 14. The pairing rule stands for the next switch — update both
together, always.
- Validate/sanitize all prompt input server-side before it reaches ModelArk.

---

## 9. Environment variables

**`.env.example` at the repo root is canonical** — it is kept current with
inline commentary on why each value is what it is. This section deliberately
does not duplicate the list, because a duplicated list drifts.

Two structural facts worth knowing:

- **`.env` is not read from the repo root.** Next.js only loads `.env` from its
  own app directory, and the plain Node worker loads it only if present locally.
  Both `apps/web/.env` and `apps/worker/.env` must exist and be kept in sync.
  Directory-scoped `.env.example` files exist in each app, trimmed to the
  variables that app actually reads.
- **Three separate credentials, three separate services:** `ARK_API_KEY`
  (ModelArk — images, video, chat), `BYTEPLUS_VOICE_API_KEY` (Seed Speech —
  TTS/ASR/cloning, a different product), and `TOS_ACCESS_KEY`/`TOS_SECRET_KEY`
  (object storage). Do not assume one key works across them.

**Auth provider rationale:** email magic link + Google OAuth, not GitHub OAuth. The
audience here (creators, marketers, agencies) is largely non-technical — GitHub OAuth
is the right default for developer tools, not for this product. GitHub can be added as
a third Auth.js provider later with no rearchitecting if a developer/prosumer segment
becomes worth targeting explicitly.

---

## 10. Agent handoff

> The original content here was a one-time Codex prompt for the initial Phase-1
> build. That build is done; the prompt is retired.

This project is built by AI agents (Claude Code primarily, with Codex and
Antigravity as fallbacks if session budget runs out). Handoffs are expected and
routine, so the repo — not any agent's private memory — is the source of truth.

**Opening instruction for any agent taking over:**

> Read `PROJECT_STATE.md` first, then `BUILD_PLAN.md`, then this file. Pick the
> next unblocked block from `BUILD_PLAN.md` and do only that block. Before
> touching Voice code, read `MODELARK_VOICE_AVATAR_REFERENCE.md` — BytePlus's
> published samples differ from real API behavior in several confirmed places.
> Verify with `pnpm typecheck && pnpm test && pnpm build` and report the actual
> output; do not claim completion otherwise. Ask before adding any major
> dependency not already in §2. Update `PROJECT_STATE.md` before you finish.

**Two rules that exist because they were violated and cost real time:**

1. **Never promote an unconfirmed API contract to confirmed without a live
   call.** The reference docs mark every contract explicitly. BytePlus's own
   console samples contain placeholder values that fail in practice.
2. **Never trust a self-report of completion — including your own.** An earlier
   agent on this project reported six tasks complete when they had hallucinated
   a dependency, broken a build, and shipped a stub UI. Run the verification
   commands.
