# Project State

**The single source of truth for "where is this project right now."**
Last verified: 2026-08-29

If you are an AI agent (Claude, Codex, Antigravity, or otherwise) picking this
project up, **read this file first**, then the doc map below. Do not trust your
own memory of this project, and do not trust `README.md`'s feature list over
this file — this file is updated deliberately at the end of each work session.

---

## 1. Doc map — read in this order

| File | What it is | Trust level |
|---|---|---|
| **`PROJECT_STATE.md`** (this file) | Current status, blockers, verification state | **Authoritative on status** |
| `CAPABILITY_MAP.md` | BytePlus catalog vs Higgsfield parity, and the gaps | Authoritative on scope/ambition |
| `BUILD_PLAN.md` | Forward plan, block by block | Authoritative on what to build next |
| `ARCHITECTURE.md` | Durable design: stack, data model, request flow, and *why* | Authoritative on design |
| `MODELARK_API_REFERENCE.md` | Image/video/chat API contracts | Authoritative on those APIs |
| `MODELARK_VOICE_AVATAR_REFERENCE.md` | Voice (TTS/ASR/cloning) + Avatar research | Authoritative on Voice APIs — read before touching any Voice code |
| `README.md` | Local setup & run commands | Trust setup commands; **its feature list lags** |

**Ground rule that has repeatedly mattered on this project:** BytePlus's public
docs are incomplete and their console sample code uses placeholders that are
wrong in practice. Every API contract in the two reference docs above is marked
either *confirmed live* or *unconfirmed*. Never promote an unconfirmed contract
to confirmed without a real call. Several days of bugs on this project came from
assuming an unconfirmed shape was right.

---

## 2. What is built and verified

**Verified live** = a human ran it in the browser against the real BytePlus API
and saw the correct result.

| Feature | Where | Status |
|---|---|---|
| Auth (email magic link + Google) | `/sign-in` | ✅ Verified live |
| Credit wallet + ledger | — | ✅ Verified live (debit + refund) |
| Job pipeline (BullMQ + SSE) | — | ✅ Verified live |
| Image generation | `/studio` | ✅ Verified live |
| Video generation | `/studio` | ✅ Verified live |
| Gallery | `/gallery` | ✅ Verified live |
| Director agent (brief → shots → video) | `/director` | ✅ Verified live (7-shot plan) |
| Marketing agent (URL → ad) | `/marketing` | ✅ Verified live (apple.com/airpods-pro) |
| Voice — Standard TTS | `/studio` (Voice tab) | ✅ Verified live |
| Design system (dark theme) | all pages | ✅ Verified live |

### Recently verified live (2026-08-28)

| Feature | Where | Status |
|---|---|---|
| Voice — Expressive TTS | `/studio` (Voice tab → Expressive) | ✅ Playable clip produced — closes the gap left by the `06240ec` envelope fix |
| Speech-to-Text | `/transcribe` | ✅ Verified (user-reported) |
| Per-job generation params (A2) | `/studio` | ✅ Defaults unchanged — image 1 credit, video 14 credits at 5s/720p |
| Variable pricing + new controls (C1) | `/studio` | ✅ Cost preview tracks resolution/duration changes |
| **Image-to-video (C2)** | `/studio` (Video tab) | ✅ **Verified live 2026-08-29** — picked a generated image as first frame, got a 5s clip animating that exact image |
| Upload own images (C3) | `/studio` | ✅ Verified live 2026-08-29 |
| **Multi-reference / character consistency (C4)** | `/studio` (Image tab) | ✅ **Verified live 2026-08-29** — subject and second reference both carried into the result. First attempt failed because a stale worker process was serving pre-C4 code; see §4 Windows gotchas. |
| Saved named characters | `/studio` (Image tab) | ⚠️ Built, tests pass, **not yet exercised in the browser** |
| First/last keyframes + adaptive ratio | `/studio` (Video tab) | ⚠️ Built, tests pass, **not yet exercised in the browser** |

Two items are currently built but unproven: saved named characters, and
first/last keyframes.

---

## 3. Active blockers

### 3.1 Voice Cloning — blocked on BytePlus support (external)

`POST /api/v3/tts/voice_clone` returns HTTP 500:
```json
{"code":55000000,"message":"resource ID is mismatched with speaker related resource"}
```

**What has been ruled out** (do not re-investigate these):
- ❌ Wrong `speaker_id` — was invented client-side, fixed in `6b26dbf` to send `""` per official docs. Same error persists.
- ❌ Wrong request shape — matches BytePlus's own documented sample and console sample exactly.
- ❌ Account/quota problem — the identical audio file clones successfully through BytePlus's own console UI. Quota was 20 slots, now 19 after that successful console clone.
- ❌ Wrong API key — console confirms a single unified key, already in use and working for TTS/ASR.

**Notable:** error code `55000000` does not appear in BytePlus's published Voice
Replication error table (which only documents `45001xxx` and `55001xxx`). It is
failing below their voice-training logic — likely gateway/routing.

**Unverified hypothesis, not yet tried:** every other Voice endpoint identifies
its model/resource (`X-Api-Resource-Id: seed-tts-2.0` for TTS,
`volc.seedasr.auc` for ASR, a `model` body field for audio-generation), but
`tts/voice_clone`'s documented contract has none. The console playground URL for
that page carries `ResourceID=volc.seedtts.default`. Adding an
`X-Api-Resource-Id` header may be the missing piece — but this is a **guess**,
and each failed attempt was cheap only because it failed at the gateway.

**Next action:** user to contact BytePlus support. Draft message is in
`BUILD_PLAN.md` § Blocked Work.

### 3.2 Avatar (OmniHuman) — blocked on model ID (needs user)

No code written. `MODELARK_VOICE_AVATAR_REFERENCE.md` has research-grade notes
only (moderate confidence it reuses the existing `/contents/generations/tasks`
video endpoint via an undocumented `OmniReferenceTaskType` field found in the Go
SDK; ~$0.12/sec; image + audio inputs).

**Next action:** user to check BytePlus Console → ModelArk → Model Square for an
OmniHuman model card and report the exact model ID string. Do not write Avatar
code before this — the project has already lost time to unconfirmed model IDs
(`seed-2-1-260628` was a placeholder that 404'd; the real one turned out to be
`dola-seed-2-1-turbo-260628`).

### 3.4 Scope correction (2026-08-28) — read this before planning work

The project's goal is a **Higgsfield-grade platform built on the full BytePlus
catalog**, not a wrapper over three endpoints. Work up to this date was scoped
too narrowly: every generation feature built so far uses the *simplest mode* of
its model, at the *smallest* output settings.

Concretely — Seedance supports 7 modes and we use 1; Seedream supports 5–8 and we
use 1; video is hardcoded to 5s/720p when the model does 4–30s at up to 4K. 3D
generation and multimodal embeddings are entirely untouched. See
`CAPABILITY_MAP.md` for the full inventory and the Higgsfield parity gap.

**Consequence:** the data model could not express most of the remaining work
(hardcoded generation profiles, no asset-as-input, flat credit cost). That was
fixed in block **A2** (`4a37f56`) — generation params are now per-job, jobs can
consume owned assets via a `JobInputAsset` join table, and credit cost is a
function of duration × resolution. **Phase C capability work is unblocked.**

Two things to know before building on it:
- Job reads normalize legacy rows (written before params existed) through
  `normalizeInputParams` in `packages/db/src/prisma-store.ts`. Don't bypass it.
- Resolution cost multipliers in `packages/shared-types/src/generation.ts` are
  **UNCONFIRMED** and deliberately biased high. Verify against real BytePlus
  per-resolution pricing before any launch.

### 3.3 Phase 4 (Billing / Admin / Community) — blocked on business decisions

Cannot start without: payment provider (Stripe / Razorpay / other), pricing
tiers, and whether this serves real paying customers or is an internal demo.
Guessing here produces throwaway work.

---

## 4. Hard-won API knowledge

Non-obvious things this project paid for in debugging time. **Preserved here
because losing them means re-paying that cost.** Full detail lives in the two
reference docs; this is the index.

| Discovery | Impact |
|---|---|
| BytePlus Voice is a **separate product** from ModelArk — different host (`voice.ap-southeast-1.bytepluses.com`), different auth header (`x-api-key`, not `Authorization: Bearer`), different API key | Hence `packages/voice-client` exists separately from `packages/modelark-client` |
| `tts/unidirectional` returns **NDJSON** (multiple newline-delimited JSON objects), not one JSON value — and its `Content-Type` header lies (`text/plain`) | A short test prompt returns a single line and *looks* like plain JSON; only a longer prompt reveals the truth |
| `tts/create` uses a **different envelope** from `tts/unidirectional` — real `application/json`, clip under `audio` not `data` | Same product family, different shapes — do not assume consistency |
| ASR job status lives in the **`x-api-status-code` response header**, not the JSON body | `20000001`=processing, `20000000`=complete, `20000003`=complete-but-no-speech |
| `20000000` is a generic company-wide "OK" code reused across unrelated endpoints | Do not treat seeing it once as proof of a specific job state |
| ModelArk chat model ID is `dola-seed-2-1-turbo-260628` | Confirmed via console Model Square; an earlier guessed ID 404'd |
| Image generation is **synchronous**; video is **async** (create → poll) | Do not build a poll loop for images |

### Windows-specific operational gotchas

- Stale `node` worker processes survive rebuilds and silently serve old compiled
  code. This caused a multi-hour false diagnosis. Before concluding a worker fix
  didn't work, verify no stale process:
  ```bash
  powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { \$_.CommandLine -like '*dist/index.js*' } | Select-Object ProcessId, CommandLine"
  ```
- The BytePlus docs site is a JS-rendered SPA. Plain HTTP fetching returns
  navigation chrome only. Use a real browser tool to read it.
- **PostgreSQL has no registered Windows service on this machine.** Nothing
  starts it at boot, so a session that begins with the worker logging
  `Can't reach database server at localhost:5432` needs it started by hand —
  see `README.md` § Development. Redis (Memurai) *is* a service and does start
  on its own, so "Redis is up" is not evidence that Postgres is.
- **Never run `pnpm build` while `next dev` is running.** Both write
  `apps/web/.next`. The production build stomps the dev server's artifacts, and
  the symptom is bizarre: the app serves with *no CSS at all* and unrelated
  pages throw `MODULE_NOT_FOUND`. Recovery: stop dev, `rm -rf apps/web/.next`,
  start dev again. Cost an hour of false debugging once.

---

## 5. Verification commands

Run these before trusting any claim about this repo — including claims made by a
previous agent (this project has been burned by an agent self-reporting
"complete" for work that was broken).

```bash
pnpm typecheck   # all 8 packages
pnpm test        # 253 tests, all must pass
pnpm build       # full monorepo build
```

**CI runs exactly these** on every push to `main` and every PR
(`.github/workflows/ci.yml`). It has been verified to go green on good code and
red on a deliberate break, so a red badge is a real signal. To modify the
workflow, push to a `ci-verify/**` branch first — that pattern triggers CI
without touching `main`.

**Current baseline (2026-08-29):** 253 tests passing across 8 packages —
prompt-library 5, db 31, voice-client 18, modelark-client 11, shared-types 49,
agents 18, web 83, worker 38. Typecheck and build both clean.

Running the app locally requires two processes (see `README.md`); the worker has
no watch mode and **must be rebuilt after every change**:
```bash
pnpm --filter @creative-ai/web dev
pnpm --filter @creative-ai/worker build && pnpm --filter @creative-ai/worker start
```

---

## 6. Handoff notes for a non-Claude agent

This project has been built primarily in Claude Code. If you are Codex,
Antigravity, or another agent taking over:

1. **Everything you need is in this repo.** Prior Claude sessions kept private
   memory files outside the repo; all durable knowledge from those has been
   moved into this file and the reference docs. You are not missing hidden
   context.
2. **Read `MODELARK_VOICE_AVATAR_REFERENCE.md` before touching Voice code.** It
   documents four API contracts whose real shapes differ from BytePlus's own
   published samples in ways that will cost you hours to rediscover.
3. **Respect the confirmed/unconfirmed markers.** They are not hedging — they
   record whether a real call was made.
4. **Do not claim work is done without running the § 5 commands.** State the
   actual output.
5. **Credit cost and model ID are coupled** (`ARCHITECTURE.md` § 8). Changing a
   default generation model without updating its credit cost in the same change
   silently mis-bills against real BytePlus spend.
6. **Update this file** at the end of your session — especially §2 verification
   status and §3 blockers. A stale state doc is worse than none.
