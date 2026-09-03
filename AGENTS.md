# AGENTS.md — cold start for any agent working on this repo

Written for Antigravity, Claude Code, Codex, or a human picking this up with no
memory of how it got here. Last updated **2026-09-03**.

Everything you need is in this repository. Nothing important lives only in a
chat transcript. If a fact is not written down here or in the documents this
one points at, treat it as unknown rather than assuming it.

---

## 1. What this is

**Creative AI** — a creative platform built on the full BytePlus ModelArk
catalogue, aiming at Higgsfield-grade capability rather than a thin wrapper
around one model.

- Built and operated by **Naveen Reddy** for his employer. The users are that
  company's creative and marketing people, plus an HR/director stakeholder who
  reviews the work.
- One workspace turns a description into **images, video, speech, and 3D
  meshes**. The working loop is *generate, tweak, compare* — not "type a
  prompt, get an artifact".
- **3D generation is ahead of Higgsfield**, which does not offer it.
- Repo: `https://github.com/QuantumWeaveDev26/Custom-interface`, branch `main`.

The active goal as of today is **deploying it for real** so the studio can use
it around the clock. See `DEPLOY.md`.

---

## 2. How to work here

These are not style preferences. They are the rules that this project has been
burned by ignoring.

### 2.1 Verify before you claim

This project has been damaged more than once by an agent reporting work as
complete when it was broken. **A passing typecheck is not evidence the app
runs. A passing test suite is not evidence a guard works.**

- Run the verification commands in Section 6 before saying anything is done.
- When you add a guard, **break it on purpose once** and confirm it fires.
  A guard nobody has seen refuse anything is a guess.
- If you did not run it, say you did not run it. Report failures with the
  actual output.

### 2.2 Simplicity, and only what was asked

- Minimum code that solves the problem. No speculative abstraction, no
  configurability nobody requested, no error handling for impossible cases.
- Touch only what the task requires. Do not improve adjacent code, reformat,
  add type hints, or refactor things that are not broken.
- Match the surrounding style even where you would do it differently.
- Clean up orphans **your** change created; leave pre-existing dead code alone
  and mention it instead.

### 2.3 Say the confusing thing out loud

If a request has two readings, name both rather than silently picking one. If
a simpler approach exists, say so. If something is unclear, stop and ask.

### 2.4 Comment voice

Comments in this codebase explain *why*, in plain prose, often naming the
failure that motivated the code. Match that. Do not write comments that restate
the line beneath them.

### 2.5 Naveen's working style

- He is new to infrastructure tooling. Terminal instructions must be
  **explicit and numbered**, one command per block, with what to expect.
- He batches manual testing: build several things, then give him **one
  consolidated checklist** to run in the browser.
- He works with more than one agent at a time. Do not assume you are alone in
  the repo — check `git status` before large edits.

---

## 3. The document map

Read in this order. The "trust" column matters: where two documents disagree,
the authoritative one wins.

| File | What it is | Trust |
|---|---|---|
| **`AGENTS.md`** (this) | Cold start, rules, current state | Entry point |
| `HANDOFF.md` | Longer-form onboarding | Getting started |
| `PROJECT_STATE.md` | Status, blockers, verification state, traps | **Authoritative on status** |
| `DEPLOY.md` | Production deployment runbook | **Authoritative on deployment** |
| `BUILD_PLAN.md` | Block-by-block plan, done and open | Authoritative on what to build |
| `MODELARK_API_REFERENCE.md` | Image / video / 3D / embedding contracts | **Authoritative on those APIs** |
| `MODELARK_VOICE_AVATAR_REFERENCE.md` | Voice (TTS / ASR / cloning) contracts | Read before touching voice |
| `CAPABILITY_MAP.md` | BytePlus catalogue vs Higgsfield parity | Authoritative on scope |
| `ARCHITECTURE.md` | Stack, data model, request flow, and why | Authoritative on design |
| `PRODUCT.md` | Product truth, users, brand commitments | Authoritative on product |
| `DESIGN.md` | Visual system, tokens, prohibitions | Authoritative on UI |
| `README.md` | Local setup | Authoritative on dev environment |

---

## 4. The shape of the system

```
apps/web       Next.js 15 (App Router). Every route is server-rendered on
               demand — nothing is statically generated. NextAuth with a
               database session strategy and the Prisma adapter.
apps/worker    A long-running BullMQ consumer. Calls ModelArk, polls, downloads
               results, stores them in TOS, writes Asset rows. Shells out to
               ffmpeg to stitch clip chains into one film and to lay narration
               under a finished film.

packages/db              Prisma schema, client, migrations, credit ledger.
packages/shared-types    The discriminated-union GenerationParams and the
                         per-model capability registry that carries price.
                         Credit cost is computed here and nowhere else.
packages/modelark-client BytePlus ModelArk HTTP client.
packages/voice-client    BytePlus Seed Speech — a separate product with a
                         separate key and separate auth header.
packages/agents          Director / Marketing / Assistant, on structured output.
packages/prompt-library  Prompt scaffolding.
```

**Request flow:** the browser posts to `/api/jobs` → credits are reserved
inside a transaction → a job row is written and enqueued on Redis → the worker
picks it up → progress streams back over server-sent events at
`/api/jobs/[id]/stream` → finished assets are served as **signed TOS URLs** via
a redirect from `/api/assets/[id]`, so media never passes through the app.

**Why the worker cannot be serverless:** a chained video job runs for many
minutes and can exceed an hour. It needs a persistent process with no request
timeout and a real filesystem for ffmpeg. Any deployment plan that puts the
worker on a function platform is wrong.

---

## 5. Where things stand

### 5.1 Working and verified live

Image, video, chained long-form video (up to 16 rounds stitched into one film),
narration over a finished film, 3D generation, text-to-speech, transcription,
semantic search over generated assets, the Director and Marketing agents, the
in-app Assistant with a RAG knowledge base, and project records (characters,
locations, props).

### 5.2 Added today (2026-09-03) — deployment groundwork

| Change | State |
|---|---|
| `ALLOWED_SIGN_IN` allowlist gating every sign-in | **9 unit tests pass; never tested against a live sign-in** |
| `trustHost: true` in the NextAuth config | Needed behind a reverse proxy; untested live |
| `GET /api/health` — checks Postgres and Redis, public by design | Untested live |
| `infra/Dockerfile` — one file, four stages: builder, web, worker, migrate | **Never built. There is no Docker on the dev machine.** |
| `infra/docker-compose.prod.yml` — Postgres, Redis, one-shot migrate, web, worker, Caddy | Never run |
| `infra/Caddyfile` — automatic HTTPS, SSE passed through unbuffered | Never run |
| `infra/.env.production.example` | Complete |
| `infra/backup.sh` — nightly `pg_dump`, 14-day rotation | Never run; restore never rehearsed |
| `DEPLOY.md` — the runbook | Complete |
| `.dockerignore` | Complete |
| Video model decoupled from env templates (`89f33c9`) | Removed pinned model/rates to protect capabilities; regression guard verified via deliberate breakage |
| Dead test coverage restored (`ddc0870`) | Added 4 compiled test files to `apps/web/package.json`; all 17 tests executed and passed |

**The single most important change** is the allowlist. Before it, anyone on the
internet with a Google account could sign in, receive a welcome grant, and
spend real ModelArk money. In production an empty `ALLOWED_SIGN_IN` now admits
nobody.

### 5.3 The immediate next task

Deploy. `DEPLOY.md` Section 1 lists what only Naveen can do (rotate keys, buy
the server, DNS, Google OAuth credentials); Section 2 is the numbered runbook.

Expect the first `docker compose up -d --build` to need one or two corrections,
because the images have never been built. The two likely places are the pnpm
install layer and the Prisma engine's OpenSSL dependency.

### 5.4 Blocked, and why

- **Voice cloning** — waiting on BytePlus support. External.
- **Avatar / OmniHuman** — no model ID available on this account.
- **Other model families** — need vendor accounts the company has not opened.
- **Billing / admin (Phase 4)** — blocked on business decisions, not code.

### 5.5 Outstanding chores that are not code

- **Rotate `ARK_API_KEY` and `BYTEPLUS_VOICE_API_KEY`.** They appeared in
  shared screenshots and they bill real money. Outstanding for several
  sessions. Do this before the platform is reachable from the internet.
- Delete the sample `Arjun` project record left in the development database.
- Run the browser checklist in `PROJECT_STATE.md` § 2b.

---

## 6. Verification commands

Run these before trusting any claim about this repo — including claims made by
a previous agent.

```bash
pnpm typecheck
```

```bash
pnpm test
```

As of 2026-09-03: **438 tests, 0 failures**, across 14 tasks. If you see a
lower total, something stopped being compiled — check the explicit `include`
list in `apps/web/tsconfig.test.json` and the explicit file list in the `test`
script of `apps/web/package.json`. Both are hand-maintained, and a test file
missing from either is **silently never run**.

```bash
pnpm build
```

---

## 7. Traps that have already cost hours

Read this section before debugging anything. Every item below was paid for.

### 7.1 Development machine (Windows)

- **PostgreSQL has no registered Windows service.** Nothing starts it at boot.
  A session that opens with `Can't reach database server at localhost:5432`
  needs it started by hand. Redis (Memurai) *is* a service and does start on
  its own, so "Redis is up" is not evidence that Postgres is.
- **Never run `pnpm build` while `next dev` is running.** Both write
  `apps/web/.next`. The production build stomps the dev server's artifacts and
  the symptom is bizarre: the app serves with no CSS at all and unrelated pages
  throw `MODULE_NOT_FOUND`. Recovery: stop dev, delete `apps/web/.next`, start
  dev again.
- **Dev CSS is not content-hashed.** Hard-reload after any CSS change. Two
  "your change did nothing" reports were this.
- Start the dev server as `node node_modules/next/dist/bin/next dev` from
  `apps/web`. The `pnpm` and `npx` shims are not reliably available to every
  spawner on this machine.

### 7.2 Prisma

- **After any migration, restart both the dev server and the worker.** A
  running process holds the previously generated client and will report a
  column that plainly exists as missing. This has cost time three separate
  times.
- The Prisma engine resolves relative to the working directory. Scripts that
  assume the repo root break when run from a package.
- The client is generated code. It is absent from a fresh checkout — run
  `pnpm db:generate` before anything that imports it compiles. The Dockerfile
  does this explicitly for exactly this reason.

### 7.3 Tests that lie by omission

`apps/web/tsconfig.test.json` and the `test` script in `apps/web/package.json`
are two hand-maintained lists, and a test file must be in **both** to run. If
it is missing from the tsconfig it is never compiled, and if it is missing from
the run list it is never invoked. Crucially, `node --test` prints "Could not find"
on a missing target and **still exits zero** — which is why dead coverage is
invisible to CI unless someone watches the test count.

The previous dead coverage (`design-canon.test.ts`, `knowledge.test.ts`,
`character-trust.test.ts` and `project-record-text.test.ts`) was closed on
2026-09-03 (commit `ddc0870`); all seventeen tests ran and passed immediately.
The trap itself remains live whenever a new test file is created: register it
in both lists or it does not exist.

### 7.4 ModelArk

- Video task type is inferred from request content. Supplying `reference_video`
  makes it an **extension**, and an extension **requires `ratio: "adaptive"`** —
  any other value is rejected. Seventy-two unit tests passed against the wrong
  shape; only a live run caught it.
- The provider returns the last frame as **JPEG**, not PNG. Storage that
  accepts only PNG silently drops it.
- Video comes back **with audio**. An earlier default of `withAudio: false`
  was asserted without measuring and was actively stripping sound.
- A running task **cannot be cancelled**.
- 4K is not available on the 2.5 model; extension is.
- `GET /models` returns an inventory, but it is **not exhaustive** — absence
  from that list is not proof a model is unavailable.

### 7.5 Credits and capability limits

Credit cost lives in `packages/shared-types/src/generation.ts` and nowhere
else. The per-model capability registry there also carries each model's
duration and resolution limits.

Build those limits **first-wins per resolution**, not with
`Object.fromEntries`. A previous version let the 4K model — capped at 15
seconds — overwrite the 720p and 1080p entries, which made 30 seconds
unreachable in the interface while the backend supported it perfectly. The user
lost a generation to this.

---

## 8. Environment variables

`.env.example` documents development. `infra/.env.production.example` documents
production and is the more complete of the two. Keys that spend money:
`ARK_API_KEY`, `BYTEPLUS_VOICE_API_KEY`, and the four `TOS_*` values.

Never print a key value into a chat, a log, a commit, or a screenshot.

---

## 9. What only Naveen can do

Do not attempt these; surface them as requests.

- Rotate the BytePlus keys.
- Buy or resize the server, register the domain, set DNS records.
- Create Google OAuth credentials.
- Add funds to the BytePlus account, or approve any spend.
- Run a live generation. **Generations cost real money — never run one to
  "check" something unless he has explicitly approved that specific run.**
