# Handoff

**Start here.** This is the single entry point for anyone — human, Claude,
Codex, Antigravity — picking this project up cold. Written 2026-08-31.

Everything needed is in this repository. Nothing important lives only in a chat
transcript.

---

## 1. What this is

**Creative AI** — a Higgsfield-grade creative platform built on the full
BytePlus ModelArk catalogue. Naveen Reddy builds and operates it for his
employer; the intended users are that company's creative and marketing people.

One workspace turns a description into images, video, speech, and 3D meshes.
The working loop is *generate, tweak, compare* — not "type a prompt, get an
artifact".

One capability is ahead of Higgsfield: **3D generation**, which they do not
offer.

Repo: `https://github.com/QuantumWeaveDev26/Custom-interface` (branch `main`).

---

## 2. Read these, in this order

| File | What it is | Trust |
|---|---|---|
| **`AGENTS.md`** | Cold start for any agent: rules, current state, traps | **Read first** |
| **`HANDOFF.md`** (this) | Entry point, environment, how to run | Authoritative on getting started |
| `DEPLOY.md` | Production deployment runbook | **Authoritative on deployment** |
| `PROJECT_STATE.md` | Current status, blockers, verification state | **Authoritative on status** |
| `BUILD_PLAN.md` | Block-by-block plan, what is done and open | Authoritative on what to build |
| `MODELARK_API_REFERENCE.md` | Image/video/3D/embedding contracts | **Authoritative on those APIs** |
| `MODELARK_VOICE_AVATAR_REFERENCE.md` | Voice (TTS/ASR/cloning) contracts | Read before touching Voice |
| `CAPABILITY_MAP.md` | BytePlus catalogue vs Higgsfield parity | Authoritative on scope |
| `ARCHITECTURE.md` | Stack, data model, request flow, and why | Authoritative on design |
| `PRODUCT.md` | Product truth, users, brand commitments | Authoritative on product |
| `DESIGN.md` | Visual system, tokens, prohibitions | Authoritative on UI |
| `DEMO.md` | Putting it behind a public URL | Setup steps |
| `README.md` | Local setup | Trust commands; feature list lags |

---

## 3. Environment — the things that will waste your day

These were each paid for in real debugging time.

### 3.1 `npx` and `node_modules/.bin` shims hang in Git Bash

**This is the newest and most disruptive finding (2026-08-31).**

`npx tsc --version` and `./node_modules/.bin/tsc --version` both hang
indefinitely. Plain `node` is instant. A typecheck that appears to hang for
seven minutes is this, not your code — it cost an hour and a false diagnosis of
disk failure before it was isolated.

**Call binaries through `node` directly:**

```bash
# typecheck one package
node ../../node_modules/typescript/bin/tsc -p tsconfig.json --noEmit

# dev server (from apps/web)
node node_modules/next/dist/bin/next dev

# worker (from apps/worker, after building)
node --env-file-if-exists=.env dist/index.js
```

**This appears specific to the Git Bash shell.** The same commands run fine in
PowerShell — `npx pnpm --filter @creative-ai/web dev` works there. If your
tooling uses PowerShell, ignore this section and use the normal scripts:

```powershell
npx pnpm --filter @creative-ai/worker build
npx pnpm --filter @creative-ai/worker start
npx pnpm --filter @creative-ai/web dev
npx pnpm test
```

### 3.2 PostgreSQL has no Windows service

Nothing starts it at boot. Redis (Memurai) *is* a service and does start on its
own — so "Redis is up" is not evidence that Postgres is.

```bash
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "C:/Program Files/PostgreSQL/18/data" -l "C:/Program Files/PostgreSQL/18/data/startup.log" start
```

Symptom of forgetting: the worker log fills with
`Can't reach database server at localhost:5432` while the web app starts fine.

Check first: `"/c/Program Files/PostgreSQL/18/bin/pg_isready.exe" -h localhost`

### 3.3 The worker must be **restarted**, not just rebuilt

It has no watch mode. A stale `node` process keeps serving old compiled code and
the symptom is silent — the feature simply does nothing. This has caused two
multi-hour false diagnoses.

Verify the process start time is later than the build:

```bash
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { \$_.CommandLine -like '*dist/index.js*' } | Select-Object ProcessId, CreationDate"
```

### 3.4 Never run a production build while `next dev` is running

Both write `apps/web/.next`. The symptom is bizarre: the app serves with **no
CSS at all** and unrelated pages throw `MODULE_NOT_FOUND`. Recovery: stop dev,
delete `apps/web/.next`, restart dev.

Also: never run two dev servers. The second takes port 3001 while the first
keeps serving stale code from the same `.next`.

### 3.5 Dev CSS is not content-hashed

`/_next/static/css/app/layout.css` has no hash, so browsers happily serve a
cached stylesheet across reloads. **Two separate "your change did nothing"
reports were this.** Hard-reload (`Ctrl+Shift+R`) after any CSS change.

### 3.6 Prisma generate fails while services run

`EPERM ... query_engine-windows.dll.node`. Stop the worker and dev server first.

---

**A migration invalidates every running process.** The dev server and the
worker each hold a generated Prisma client in memory; after `prisma migrate`,
restart both or the next request fails with `Unknown field` while everything on
disk is correct. Cost three separate debugging detours on 2026-09-01.

## 4. How to run it

```bash
# 1. Postgres (see 3.2). Redis starts itself.
# 2. Worker
cd apps/worker && node --env-file-if-exists=.env dist/index.js
# 3. Web
cd apps/web && node node_modules/next/dist/bin/next dev
```

Then `http://localhost:3000`.

To rebuild the worker after changing it or any package it depends on:

```bash
cd apps/worker && node ../../node_modules/typescript/bin/tsc -p tsconfig.json
```

…then **restart it** (3.3).

For a public URL, see `DEMO.md`.

---

## 5. Verification commands

```bash
node ../../node_modules/typescript/bin/tsc -p tsconfig.json --noEmit   # per package
```

Full suite is **353 tests** across 8 packages, all passing:
prompt-library 14, voice-client 18, modelark-client 11, shared-types 58,
agents 22, db 32, worker 56, web 142.

CI (`.github/workflows/ci.yml`) runs install → `db:generate` → typecheck → test
→ build on push to `main` and on PRs. It has been verified to go red on a
deliberate break, so a red badge is a real signal.

---

## 6. What is built

**Phase C is complete.** Every block C1–C9 shipped.

| Area | State |
|---|---|
| Auth (magic link + Google) | Verified live |
| Credits: wallet, ledger, debit, refund | Verified live |
| Job pipeline (BullMQ + SSE) | Verified live |
| Image: text-to-image, multi-reference, **batch up to 15** | Verified live |
| Video: text-to-video, image-to-video, **first/last keyframes**, **extend/edit** | Verified live |
| Voice: standard + expressive TTS | Verified live |
| Speech-to-text | Verified live |
| **3D: text-to-3D and image-to-3D** (.glb, PBR) | API proven live; UI unverified |
| Saved characters, usable in Studio, Director, Marketing | Built, unverified |
| Cinema grammar: 32 camera moves, 8 lenses, 10 looks | Built, unverified |
| Semantic search + "more like this" over own library | Built, unverified |
| Prompt-box attachments, images and video | Built, unverified |
| Gallery: batch grouping, type filter | Built, unverified |
| Director: shot plan, lens per shot, one grade per film, cast | Built, unverified |
| Marketing: URL → ad, with camera/lens/look and cast | Built, unverified |
| 3D preview in the gallery (`<model-viewer>`, loaded on click) | Built, unverified |
| Index-on-completion, off by default per user | Built, unverified |
| Feed: per-asset opt-in publishing | Built, unverified |

### Key design decisions worth not relitigating

- **One shot grammar.** `packages/prompt-library` owns camera/lens/look;
  Studio, Director, and Marketing all compose through `composeShotPrompt`, so
  they cannot drift.
- **Look is per plan, not per shot.** A film has one grade; a different grade
  per shot yields clips that do not belong together.
- **Cast is per plan** for the same reason.
- **Cost is charged on what returned, not what was asked for.** `max_images` is
  a ceiling; the shortfall is credited back inside the completion transaction.
- **Composed prompts are shown to the user** before submission.

---

## 7. Confirmed API contracts

All in `MODELARK_API_REFERENCE.md`, each marked confirmed or unconfirmed.
**Never promote an unconfirmed contract without a real call** — this project
lost days to assumed shapes.

The non-obvious ones:

- **3D reuses the video task endpoint.** `POST /contents/generations/tasks`,
  model `hyper3d-gen2-260112`. Its options are **CLI-style flags inside the
  prompt text** (`--material PBR --quality_override 1000000`), not JSON fields.
  The file arrives at `content.file_url`, not `video_url`.
- **Video roles on the wire are `reference_image` / `reference_video`**, not the
  names we store. An image with *no* role is read as a first frame.
- **BytePlus rejects input images that may show a real human face.** Confirmed
  live. This blocks lipsync and constrains character work.
- **Batch is `sequential_image_generation: "auto"`** with
  `max_images`; references + generated ≤ 15.
- **Embeddings vectorize the whole input array as ONE vector.** A query and an
  asset must be embedded in separate calls.
- **`1K` image size does not exist.** Only 2K/3K/4K. The UI offered 1K for days.
- Voice is a **separate product**: different host, `x-api-key` not Bearer,
  different key. `tts/unidirectional` returns NDJSON and lies in its
  Content-Type. ASR status is in a **response header**.

---

## 8. Blockers — all need the owner, none need code

| # | Blocker | To unblock |
|---|---|---|
| 1 | 🔴 **Rotate `ARK_API_KEY` and `BYTEPLUS_VOICE_API_KEY`** | Console. They appeared in shared screenshots and bill real spend. Open since day one. |
| 2 | **Voice cloning** returns `55000000` at the BytePlus gateway | Support ticket. Four hypotheses ruled out; draft in `BUILD_PLAN.md`. Not our bug. |
| 3 | **Lipsync / OmniHuman** | Same ticket. `GET /models` (2026-09-01) lists nothing lipsync-shaped on this account; the list is not exhaustive, so an ID from BytePlus is still the way in. A create call with a candidate ID is free when rejected. |
| 3b | **Other model families** (Kling, Veo, Sora, Wan) | Vendor accounts and keys. Not a code problem — the account calls BytePlus models only. |
| 4 | **Deployment (F4)** | Hosting spend decision. |

Resolved 2026-08-31, all three by choosing the narrow option rather than
guessing the wide one:

- **Community feed** — publishing is per asset, opt-in, and carries the media
  and prompt only. No identity travels. Bylines, profiles, and moderation are
  additions if the business wants them, not assumptions made now.
- **Embed-on-completion** — off by default, because it spends provider tokens
  per generated asset. The toggle sits beside the manual sweep, where the cost
  is already the subject.
- **glTF viewer** — `@google/model-viewer`, imported only when the user clicks
  "Preview in 3D", so a gallery of 25MB meshes downloads none of them on sight.

---

## 9. The UI redesign — read before touching styles

The visual world was replaced twice in two days. The current one is **pinned by
the owner**, not chosen by the agent.

- **`PRODUCT.md` records the pin: Higgsfield is the bar.** Dark canvas, content
  floating as rounded panels, one saturated signal accent on primary actions,
  settings as icon chips, a composer that reads as the centre of the tool.
- **`DESIGN.md` is the system**: tokens with measured contrast ratios, shape
  scale, components, and prohibitions.
- **The signal `#d6f24f` always carries black ink.** White on it measures
  1.26:1. Enforced in `.btn-primary`, not left to callers.
- **The gradient survives on the logo mark only.**

A camera-report direction was built first from a concept roll and rejected. Do
not revive it. **A pinned brief beats a roll.**

Run the design detector after UI edits:
```bash
node "<impeccable-skill>/scripts/detect.mjs" --json <changed files>
```

---

## 10. Working discipline that has actually mattered

- **Verify a guard by breaking it.** Every guard in this repo was deliberately
  broken, watched fail, and restored. Two tests passed while the thing they
  guarded was broken — a lying test double, and a substring match
  (`SET_IMAGE_COUNT` is inside `SET_IMAGE_COUNT_BROKEN`).
- **Reducer tests cannot see markup.** The batch slider was missing from the UI
  for four commits while its tests stayed green. There is now a test asserting
  every studio action has a dispatch site somewhere in `src/app/studio`.
- **Do not trust a self-report.** Including this document. Run § 5.
- **A block labelled Output must be copy-pasted unedited.** If you are
  summarising, label it summary.
- **Never state a filename, route, identifier, or constant you have not read
  in this session.** Cite where you read it.
- **Update `PROJECT_STATE.md` at the end of a session.** A stale state doc is
  worse than none.

---

## 11. What to do next

**Before building anything: verify in a browser.** Roughly eighteen features
are built, tested, and never clicked. That is the project's largest risk, and it
is now larger than any missing feature — everything buildable without a decision
from the owner has been built. The walk-through list is in `PROJECT_STATE.md`
§ 2b.

Then, in order:

1. **Gallery, Director, Marketing layouts.** They inherited the new tokens but
   keep their old composition. Gallery matters most.
2. **A keyboard walkthrough of Studio** — the last open accessibility item.
3. Whichever of § 8 the owner unblocks.

Do not start deployment or lipsync without a decision from the owner — they are
blocked on judgement, not effort.
