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
| **`HANDOFF.md`** | Entry point for a new agent: environment, how to run, full context | **Read first** |
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
| Director agent (brief → shots → video) | `/director` | ✅ Verified live (7-shot plan). Lens/look direction added 2026-08-29, **not yet re-checked in the browser**. |
| Marketing agent (URL → ad) | `/marketing` | ✅ Verified live (apple.com/airpods-pro). Camera/lens/look direction added 2026-08-29, **not yet re-checked in the browser**. |
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
| **First/last keyframes + adaptive ratio** | `/studio` (Video tab) | ✅ **Verified live 2026-08-29** — tree as first frame, red car as last, adaptive ratio, 5s clip produced that moves between the two stills. An earlier attempt with astronaut photos was refused for a real-person input image (see §4). |

| **Video extend / edit (C6)** | `/studio` (Video tab) | ✅ **Verified live 2026-08-29** — a two-clip extend job completed. Confirmed on the wire, not just in the UI: the job carried two `source_video` inputs at positions 0 and 1. |

| Cinema presets — camera / lens / look (C5) | `/studio` | ⚠️ Built, tests pass, **not yet exercised in the browser** |
| Batch image generation (C9) | `/studio` (Image tab) | ⚠️ Built, tests pass, **not yet exercised in the browser** |

| Semantic search + more-like-this (C7) | `/gallery` | ⚠️ Built, tests pass, **not yet exercised in the browser**. Nothing is indexed yet — the first search will return nothing until "Index up to 20" is run. |

| 3D generation (C8) | `/studio` (3D tab) | Built, tests pass, **not yet exercised in the browser**. The underlying API was proven with a direct call: a .glb mesh came back in ~98s. |

Six items are currently built but unproven: saved named characters (now in both Image and Video), the cinema
presets, batch image generation, semantic search, and 3D generation. These are queued for one
batched browser-test pass rather than being verified one at a time.

---

## 2b. Next session — start here

**Twelve features are built, tested, and never opened in a browser.** That is
now the project's largest risk, larger than any missing feature. Everything that
was buildable without a decision from the user has been built.

### Do first: one bulk verification pass

Services start themselves; Postgres does not (see section 4). Then walk this
list in order and note what breaks:

| Where | What to check |
|---|---|
| Studio - Image | Saved characters load; cinema Lens/Look pills; "How many" batch slider; attach an image from the prompt box |
| Studio - Video | "Keep a character" picker; first/last keyframes; extend/edit a clip; attach a video file |
| Studio - 3D | Detail presets; generate a mesh; attach a photo for image-to-3D; download the .glb |
| Gallery | Type filter chips; a batch renders as one "Set of N"; Index up to 20, then search; More like this |
| Director | Grade line above the shots; each card shows camera + lens; cast a character; attach a reference |
| Marketing | Direction line under the prompt; cast; attach |
| Any page | Tab through it - a focus ring must be visible on every control |

Search returns nothing until "Index up to 20" is pressed. That is expected, not
a bug.

### Browser Verification Checklist (Human Pass)

- [ ] **Studio (Image):** Click a saved character chip to populate references in composer.
- [ ] **Studio (Image):** Click camera, lens, and look pills; verify prompt preview updates.
- [ ] **Studio (Image):** Drag "How many" batch slider (1–15); verify credit cost total.
- [ ] **Studio (Image):** Click prompt box paperclip and upload an image (PNG/JPEG/WebP).
- [ ] **Studio (Video):** Click "Keep a character" picker; verify reference tags `[Image 1]`, `[Image 2]`.
- [ ] **Studio (Video):** Drag/select First Frame and Last Frame stills; verify adaptive ratio.
- [ ] **Studio (Video):** Select 1–3 source video clips to test extend transition mode.
- [ ] **Studio (Video):** Attach an MP4/MOV video file via prompt box.
- [ ] **Studio (3D):** Select Draft / Standard / High quality chips; verify credit calculation.
- [ ] **Studio (3D):** Generate 1 mesh (observe single-generation quota policy).
- [ ] **Studio (3D):** Attach a reference photo for image-to-3D mesh generation.
- [ ] **Studio (3D):** Download generated `.glb` asset to disk.
- [ ] **Gallery:** Click filter chips (`All`, `Images`, `Video`, `Voice`, `3D`); check asset lists.
- [ ] **Gallery:** Visually verify multi-image batch renders as grouped "Set of N" card with badge.
- [ ] **Gallery:** Click "Index up to 20", then search library with a text query.
- [ ] **Gallery:** Click "More like this" on an asset tile to test similarity ranking.
- [ ] **Director:** Enter brief; verify global grade banner and per-shot camera + lens labels.
- [ ] **Director:** Cast character identity and attach reference image.
- [ ] **Marketing:** Enter product URL; verify direction line (style, camera, lens, look), cast, and attach.
- [ ] **Accessibility:** Press Tab key through all controls; verify 2px signal focus ring on every element.

### Then: the work that needs a decision, not code

Nothing else can proceed without one of these being settled - see section 3.

## 2c. Video model — switched 2026-08-31

Default is now **`dreamina-seedance-2-5-260628`**, up from
`dreamina-seedance-2-0-fast-260128`.

| | Before | After |
|---|---|---|
| Max duration | 15s | **30s** |
| Resolutions | 480p, 720p | 480p, 720p, **1080p** |
| Rate | 2.8 cr/s at 720p | **5.77 cr/s at 720p** |
| 5s at 720p | 14 credits | **29 credits** |
| 30s at 720p | not possible | **174 credits** |

Rate derived from a confirmed console price of **$3.46 for 15s at 720p 16:9**
(`MODELARK_API_REFERENCE.md`), against the $0.04-a-credit anchor in
`ARCHITECTURE.md` §8 — which had predicted this exact figure before the switch.

**Cost roughly doubled per second.** The default duration is deliberately
unchanged at 5s; longer clips are opt-in on the slider.

**4K is available again, on a second model.** No single model does both 30s and
4K, so the resolution the user picks chooses the model:

| Resolution | Model | Max duration |
|---|---|---|
| 480p, 720p, 1080p | `dreamina-seedance-2-5-260628` | 30s |
| **4K** | `dreamina-seedance-2-0-260128` | **15s** |

Picking 4K therefore drops the duration ceiling to 15s, and the UI brings a
longer duration down rather than letting the server reject it.

Each model carries its own per-second rate inside `VIDEO_MODEL_CAPABILITIES`,
so a model can no longer be swapped without its price coming with it.

⚠️ **Two numbers here are still UNCONFIRMED.** The `9×` 4K multiplier is derived
from pixel count, never checked against real pricing; and no published
per-second rate for 2.0-standard was found, so it is set equal to 2.5's as the
least-bad placeholder. A 15s 4K clip bills **780 credits** on that arithmetic.
Confirm both before anyone leans on 4K.

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

### 3.5 3D generation — RESOLVED 2026-08-29, built in C8

No longer blocked. BytePlus still publishes no 3D documentation; the contract
was recovered from the console model card and confirmed with one live call, and
`MODELARK_API_REFERENCE.md` R5 now records it in full.

What remains open is narrower: image-to-3D input shape, the flag that selects a
format other than glb, and the accepted values for `--mesh_mode` and `--addons`.
Do not guess any of them.

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
| **BytePlus refuses input images that may depict a real person** — `InputImageSensitiveContentDetected.PrivacyInformation`, HTTP 400, naming the offending `content[n]` | Confirmed live 2026-08-29 on a keyframe job. Scope-relevant: this is a hard limit on any feature that feeds a real photo in — face-consistent characters from real photos, and OmniHuman lipsync (B2). Ask support whether a per-account allowlist exists before planning around it. |
| That error's code contains the word "Sensitive", which naively matches a content-filter pattern | It is an *input image* rejection, not a prompt rejection. The worker checks for it first (`safeFailureMessage`); telling the user to reword sends them at the wrong problem. |

### Semantic search storage — a deliberate, revisitable choice

`AssetEmbedding.vector` is a plain `Float[]`, and cosine similarity runs in
application code (`apps/web/src/server/semantic-search.ts`). **pgvector is not
installed on this Postgres** — `pg_available_extensions` has no `vector` row —
and the feature was not worth blocking on an extension install.

This is correct for a per-user library of a few thousand vectors and wrong at
scale. Move to pgvector when either becomes true: a single user passes roughly
tens of thousands of assets, or search needs to span users (the community feed).
At that point the migration is an extension, a column type change, and an
index — the ranking logic itself is already isolated behind `rankBySimilarity`.

Also note: embedding an image costs real tokens (~13,800 in the provider's own
sample), which is why indexing is user-triggered and capped rather than
automatic.

### Windows-specific operational gotchas

- Stale `node` worker processes survive rebuilds and silently serve old compiled
  code. This caused a multi-hour false diagnosis. Before concluding a worker fix
  didn't work, verify no stale process:
  ```bash
  powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { \$_.CommandLine -like '*dist/index.js*' } | Select-Object ProcessId, CommandLine"
  ```
- The BytePlus docs site is a JS-rendered SPA. Plain HTTP fetching returns
  navigation chrome only. Use a real browser tool to read it.
- **`npx` and the `node_modules/.bin` shims hang in Git Bash** (found
  2026-08-31). `npx tsc --version` never returns; plain `node` is instant. A
  typecheck that appears to hang is this, not your code — it cost an hour and a
  false diagnosis of disk failure. Call binaries through node:
  `node ../../node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`,
  `node node_modules/next/dist/bin/next dev`.
- **Dev CSS is not content-hashed**, so a browser will serve a cached
  stylesheet across reloads. Two "your change did nothing" reports were this.
  Hard-reload after any CSS change.
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
pnpm test        # 353 tests, all must pass
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
