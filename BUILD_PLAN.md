# Build Plan

Forward-looking, block by block. Pairs with `PROJECT_STATE.md` (current status),
`CAPABILITY_MAP.md` (what BytePlus offers vs Higgsfield parity), and
`ARCHITECTURE.md` (design).

**Goal:** a Higgsfield-grade creative platform built on the full BytePlus
catalog — not a thin wrapper over three endpoints.

---

## How to use this plan

**One block at a time. Finish it. Verify it. Commit it. Then start the next.**

**A block is done when all four are true:**
1. The stated deliverable exists.
2. `pnpm typecheck && pnpm test && pnpm build` all pass (CI enforces this).
3. New behavior has a test, or a written note saying why it can't be unit-tested.
4. Committed and pushed with a message explaining *why*, not just what.

**Never mark a block done on "it should work."** This project has been burned by
exactly that — both by an agent self-reporting false completion, and by trusting
BytePlus documentation over a real call.

---

## Phase A — Foundation

Hardening and structural work. **A2 is the gate for nearly all feature work** —
do not start Phase C before it.

### F1 — Rotate exposed API credentials 🔴 SECURITY, DO FIRST
`ARK_API_KEY` and `BYTEPLUS_VOICE_API_KEY` have appeared in plaintext in shared
screenshots of `apps/web/.env`. Correctly gitignored and never committed, but
screenshot exposure is exposure, and these bill to real spend.

**Done when:** both rotated in console, old ones revoked, both `.env` files
updated, one image + one voice generation confirmed working on the new keys.
**Owner:** user (console access).

### F3 — Continuous integration ✅ DONE (2026-08-28)
`.github/workflows/ci.yml` runs install → `db:generate` → typecheck → test →
build on push to `main`, PRs, and `ci-verify/**` branches.

Verified **both directions**: green on `main` @ `f833ef8` with every step
confirmed executing, and red on a scratch branch carrying a deliberate type
error. A CI that cannot fail is worse than none.

Notes: dummy env vars are supplied because `packages/db` instantiates
`PrismaClient` at module scope; `pnpm db:generate` must run before typecheck;
push workflow changes to `ci-verify/**` first.

### F2 — API route test coverage ✅ DONE (2026-08-28 `eb04cad`, completed 2026-08-29 `c412f9c`)
Covered the two paths that matter most: job submission (the credit debit) and
asset access (the cross-user boundary). 51 web tests, was 37.

`jobs.ts` and `assets.ts` now take injected dependencies instead of importing
Prisma/BullMQ directly; job submission's composition root moved to
`job-dependencies.ts`. The fake store runs the *real* `submitJob` transaction
logic and rolls back on throw — an earlier version didn't, and reported a debit
Postgres would have undone.

Each guard was verified to actually fail when deliberately broken:
model-capability validation, enqueue compensation, asset ownership.

**Closed 2026-08-29 (`c412f9c`).** `/api/transcribe` and `/api/voice-clone`
server modules now take injected dependencies and are covered: user-scoped
storage keys, signed URLs never leaking the private tos:// location, upload
ordering, and the `speaker_id: ""` regression guard.

**Route auth covered structurally** (2026-08-29, `a59c099`): a test walks
`src/app/api` and asserts every `route.ts` checks the session and returns 401,
plus a second that no route trusts a caller-supplied `userId`. Chosen over
per-handler tests because the risk is a *new* route shipping unguarded, which
per-handler tests cannot catch.

### F4 — Deployment path
Nothing is deployed. `infra/` has local docker-compose only.
**Suggested first step:** `apps/web` to Vercel with managed Postgres + Redis,
worker still local, to prove it runs off-machine before taking on ECS.
**Blocked on:** hosting spend decision.

---

## Phase B — Capability research

Cheap, high-leverage. Every Phase C block depends on one of these. Each is
"confirm the real request/response shape with one live call, document it in
`MODELARK_API_REFERENCE.md`, mark it confirmed."

**Do these before writing the corresponding feature.** The project has already
lost days to building against unconfirmed BytePlus contracts.

| Block | Confirm | Unblocks |
|---|---|---|
| ~~**R1**~~ | ⚠️ **PARTIAL** — see `CAPABILITY_MAP.md` §4b. Seedance 2.5 confirmed GA (30s, multimodal ref); Seedream 5.0-pro confirmed (image editing); OmniHuman **not seen**. Video/image sections were cut off — recapture to close. | C2, C4, B2 |
| ~~**R2**~~ | ✅ **DONE** — request shape confirmed from official docs, recorded in `MODELARK_API_REFERENCE.md`. Same endpoint, extra `content[]` items; roles `first_frame`/`last_frame` match what A2 already defined. **Our current cheap model already supports i2v, edit, extend, and references.** | C2, C6 |
| ~~**R3**~~ | ✅ **DONE** — `image` is `string \| string[]`; array = multi-reference. Recorded in `MODELARK_API_REFERENCE.md`. `seedream-5-0-lite` supports it. | C4 |
| ~~**R4**~~ | ✅ **DONE** — edit, extend, and omni reference request shapes recorded in `MODELARK_API_REFERENCE.md`. Wire roles are `reference_image` / `reference_video` / `reference_audio`, **not** our stored role names; a bare image with no role is read as a first frame. | C6 |
| ~~**R8**~~ | ✅ **DONE** — the real-face input restriction and its two documented workarounds (trusted same-account outputs; preset digital characters via `asset://`). See `MODELARK_API_REFERENCE.md` § R8. | B2, C4 |
| ~~**R5**~~ | ✅ **DONE** — pulled from the console model card, not the docs. 3D reuses the **video task endpoint** with model `hyper3d-gen2-260112`, and its options are CLI-style flags inside the prompt text, not JSON fields. Poll response shape still unconfirmed. See `MODELARK_API_REFERENCE.md` § R5. | C8 |
| ~~**R9**~~ | ✅ **DONE** — batch image generation shape confirmed and recorded. | C9 |
| ~~**R6**~~ | ✅ **DONE** — `POST /embeddings/multimodal` recorded in `MODELARK_API_REFERENCE.md`. Critical detail: the whole `input` array becomes **one** vector, so a query and an asset must be embedded separately. | C7 |
| **R7** | Managed Agents / App Lab — replace or complement `packages/agents`? | future agent work |

**R1 is partially done.** Enough to target models for C2/C4; not enough to rule
OmniHuman in or out for B2.

---

## Phase C — Capability build

Ordered by value. **All gated on A2 below.**

### A2 — Generation contract redesign ✅ DONE (2026-08-28, `4a37f56`)

All three structural blockers fixed. `GenerationParams` is now carried per job;
a `JobInputAsset` join table lets jobs consume owned assets (ownership verified
*inside* the submission transaction); credit cost is a function of duration ×
resolution that rounds up and never returns zero.

Notes for whoever builds on this:
- Validation is split — `parseSubmitJobRequest` (pure, shape only) vs
  `assertParamsSupportedByModel` (model-aware). Unknown models validate against
  a narrow conservative set, never waved through.
- Legacy rows have no `params`; all job reads normalize through
  `normalizeInputParams` in `prisma-store.ts`. Don't bypass it.
- 5s/720p still costs exactly 14 credits, asserted by test. Resolution
  multipliers are **UNCONFIRMED** and biased high — verify before launch.
- `packages/db` now depends on `shared-types`.

**Phase C is unblocked.** C1 (expose the existing model range) is the quick win.

<details>
<summary>Original problem statement</summary>
The current data model cannot express most Higgsfield-grade features
(`CAPABILITY_MAP.md` §4). Three concrete problems:

1. **Settings are hardcoded, not per-job.** `IMAGE_PROFILE` / `VIDEO_PROFILE` are
   frozen at 5s / 720p / 21:9. Duration, resolution, and aspect ratio must become
   per-job parameters — validated server-side, never client-trusted.
2. **Jobs cannot take assets as input.** `inputParams` is text-only. Image-to-video,
   multi-reference, extension, and editing all need a job to reference existing
   assets — with ownership checks so users can't reference each other's.
3. **Credit cost is a flat constant.** Real cost scales with duration × resolution
   × model. Needs a cost function, not `VIDEO_COST`.

**Deliverable:** revised Prisma schema + `shared-types` contracts + cost function,
with migration. No new user-facing features — this is purely the shape change.
**Done when:** existing image/video/voice generation still works unchanged
end-to-end, all tests pass, and a job can carry both parameters and input asset
references.

> Doing this before C-blocks avoids building image-to-video on a shape that would
> need immediate rewriting.

</details>

### C1 — Unlock existing model range ✅ DONE (2026-08-28, `6639d38`)
Studio now exposes video resolution, aspect ratio, and a duration slider, plus
image size. The picker only offers what the server-resolved model documents
(capabilities passed down from `videoCapabilitiesFor`), so the UI cannot offer a
setting the server would reject. Live cost preview uses the same
`creditCostFor` the server charges with, built from one shared params object so
shown price cannot drift from submitted price. Defaults unchanged.

### C2 — Image-to-video ✅ DONE (2026-08-29, `b21dbbb`)
Studio Video mode offers recent generated images as a first frame; the prompt
describes the motion. Worker signs each input into a short-lived HTTPS URL
(BytePlus fetches it itself and cannot read our private bucket) — a test
asserts no raw `tos://` URL reaches the provider. Resumed jobs neither reload
nor re-sign inputs. Non-image inputs are skipped rather than guessed at.

**Keyframes + adaptive ratio ✅ DONE** (2026-08-29, `a19ec6b`) — Video mode has
a first/last frame slot toggle, so the keyframe-transition path the worker
already supported is now reachable. `ratio: "adaptive"` is exposed and guarded
on both sides: rejected by the parser without an input asset, and only listed
once a keyframe is selected.

### C3 — Upload pipeline ✅ DONE (2026-08-29, `dfb93e7`)
Studio picker has an Upload tile. Format decided by magic bytes, never the
declared Content-Type or filename; storage key built from user id + UUID so a
crafted filename cannot escape the prefix. Asset row written only after the
object lands. `Asset.jobId` became nullable (uploads have no job).
**Video added 2026-08-29 (`d82cc0a`)** — MP4 and MOV are recognised by their
`ftyp` box, with the size limit applied per kind after detection (15 MB image,
100 MB video). Attachment is available from the prompt box on Studio, Director,
and Marketing, not only from the dedicated pickers.

**Still open:** audio upload for lipsync is not built.

### C4 — Character consistency ✅ DONE (2026-08-29, `9c3db6a`)
Image mode takes ordered reference images (`image: string[]`). Selection order
is send order; numbered badges make "image 1"/"image 2" in the prompt match
what the user sees. `seedream-5-0-lite` already supports it — no model upgrade.

**Saved characters ✅ DONE** (2026-08-29, `998f811`) — name a reference set,
reload it into any later generation. Ownership checked inside the creation
transaction; delete is userId-scoped and 404s rather than 403s.

**Characters in Video ✅ DONE** (2026-08-29, `faf14fb`) — the same ordered reference
images and saved-character shelf now appear in Video mode, sent as omni
reference (R4). The picker is one shared component rather than a copy.

**Cast in the agents ✅** (2026-08-29, `892b8bb`) — Director and Marketing each
take one cast character for the whole plan, sent as reference images on every
generation. A saved identity now reaches every tool.

**Still open:** the cast is not offered on Transcribe or Voice Clone, which
have no visual output to carry it.

### C5 — Cinema Studio depth ✅ DONE (2026-08-29, `3220188`)
`packages/prompt-library` now carries three axes — 32 camera moves (stackable,
order-preserving), 8 lens presets with focal length and aperture, 10 look
presets — composed onto the user's description by `composeShotPrompt`. Studio
exposes all three and shows the composed result before submitting.

**Director wired in ✅ DONE** (2026-08-29, `fd20589`) — it now picks a lens per
shot and one look for the whole plan, composing through the same
`composeShotPrompt` Studio uses so the two cannot drift.

**Marketing wired in ✅** (2026-08-29, `dd5e985`) — it picks camera, lens, and
look too, constrained to stay consistent with the ad style it already chose.
All three agents and Studio now compose through one grammar.

**Still open:** Director and Marketing each pick a single camera move, never a
stack of two, so the ordering behaviour `composeShotPrompt` supports is only
reachable from Studio.

### C6 — Video extension and editing ✅ DONE (2026-08-29, `cb6d918`)
Studio Video mode takes up to three of the user's clips. One extends; two or
three generate the transitions between them. Roles are mapped to their wire
names at the worker boundary — this fixed reference images being sent unroled,
which the provider reads as a first frame rather than as no role at all.

**Still open:** `reference_audio` is documented but unwired, so audio-driven
generation is not offered. Editing is reachable (a clip plus reference images
plus a prompt) but has no dedicated UI framing separating it from extending.

### C7 — Semantic search ✅ DONE (2026-08-29, `f18cdc9`) / community feed still open
Gallery ranks your own assets by meaning, with "more like this" from any
result. Vectors live in a plain `Float[]` column and similarity is computed in
application code — pgvector is not installed on the target Postgres and the
feature was not worth blocking on a database extension.

**Deliberately not built: the cross-user community feed.** That is not more of
the same work — it needs a publish/visibility model (what is public, who can
see it, how it is taken down), which is a product decision of the same kind as
Phase 4's, not something to guess at. Search is per-user until that is decided.

**Still open besides that:**
- Indexing is manual and capped at 20 per call. New assets are not embedded on
  completion, so the library drifts out of date until the user indexes again.
  Embedding on completion would spend tokens per generation, which is a pricing
  decision.
- Changing `EMBEDDING_DIMENSIONS` or the model invalidates every stored vector.
  Loads filter to the current model so nothing breaks, but there is no
  reindexing path — old rows simply stop matching.

### C8 — 3D generation ✅ DONE (2026-08-29, `9de44a9`) 🟢 differentiator
Studio 3D tab: text to a .glb mesh with PBR materials, three detail presets.
Reuses the video task endpoint; settings ride as CLI flags inside the prompt
text; the file arrives under `content.file_url`. The one thing on this roadmap
Higgsfield does not offer.

**Still open:**
- ~~Image-to-3D~~ ✅ DONE (2026-08-29, `a59c099`) — confirmed live and wired:
  an `image_url` item beside the text, no role. Attach a photo in the 3D tab.
- Output is glb only. obj/stl/fbx/usdz are documented but the selecting flag is
  unknown.
- `--mesh_mode` and `--addons` are not exposed - only one sample value each is
  confirmed, and guessing repeats the `1K` image-size mistake.
- No 3D viewer. The gallery offers a download; an inline preview would need a
  glTF renderer.
- **Cost is a placeholder** anchored to one observation (~30,000 tokens, ~$0.40
  a mesh). Verify against a real invoice before launch.
- Hitem3d-2.0 (image-to-3D, 500K free quota) is untouched.

### C9 — Batch generation / variants ✅ DONE (2026-08-29, `22388cb`)
Up to 15 images per request via `sequential_image_generation: "auto"` (R9).
Job completion went plural to hold them, and the shortfall between images
requested and images returned is credited back inside the completion
transaction — `max_images` is a ceiling, not a quantity.

**Gallery grouping ✅ DONE** (2026-08-29, `917c365`) — assets from one job render
as a labelled set, and the gallery filters by type from the URL.

**Still open:** batch is image-only; video has no equivalent.

---

## Blocked work

### B1 — Voice Cloning
Blocked on BytePlus support. Four hypotheses already ruled out — read
`PROJECT_STATE.md` §3.1 before touching. Support message draft is there too.
**Follow-on:** surface cloned voices as selectable speakers in Studio.

### B2 — Lipsync / talking avatar (OmniHuman)
Blocked on model ID confirmation via Model Square (folds into R1). Higgsfield's
Lipsync Studio equivalent.

**Second blocker found 2026-08-29:** BytePlus rejects input images that may show
a real person (`InputImageSensitiveContentDetected.PrivacyInformation`,
confirmed live). A talking avatar of a real person is exactly that input.

R8 found two sanctioned routes around it — trusted same-account model outputs
(30-day window), and the preset **digital character library** (`asset://<id>`).
The digital-character route is the more promising one for B2, since it is
allowed by design rather than by a trust heuristic our storage pipeline may
already be breaking. See `MODELARK_API_REFERENCE.md` § R8.

### B3 — Phase 4: Billing, Admin
Blocked on payment provider, pricing tiers, and audience (real customers vs
internal demo). `ARCHITECTURE.md` §8 notes the 100-credit welcome grant needs a
signup-abuse guard before any public launch.

---

## Polish backlog
- **P1** Responsive pass - checked at 375px on 2026-08-29 for sign-in and the
  nav, which already carries a mobile scroll row. Studio, Director, Marketing,
  and Gallery sit behind auth and were **not** checked in a real mobile browser.
- **P2** Empty states ✅ DONE (2026-08-29, `faf14fb`) — Director, Marketing, and
  Transcribe each state what the tool does and offer an example to run.
  Per-page *error* states already existed.
- **P3** Accessibility — focus and contrast ✅ DONE (2026-08-29, `faf14fb`): one
  systemic `:focus-visible` rule where there had been none at all, `--text-faint`
  raised from 3.47:1 to above 4.5:1 on every surface, and a
  `prefers-reduced-motion` block. Director and Marketing gained `aria-live`
  regions in `892b8bb`; Studio, Transcribe, and Voice Clone already had one.
  **Still open:** a full keyboard walkthrough of Studio.

---

## Recommended order

```
F3  ✅ done
A2  ✅ done — Phase C is unblocked
F1  ─→ user, today (security)
R1  ─→ user, today (Model Square — gates all research)
C1  ✅ done
F2  ✅ done
R2 → C3 → C2  ─→ the highest-value feature chain
R3 → C4       ─→ headline feature
C5  ─→ parallel anytime (no API dependency)
R4→C6, R6→C7, R5→C8, C9  ─→ after the above
F4, B1/B2/B3, P1–P3
```

**Reality check on scale:** Phase C is months of work, not days. Higgsfield is a
funded product with a team. The sequence above is ordered so that each block ships
something usable on its own rather than requiring the whole roadmap to land first.

**If session budget runs short mid-block:** stop at a committed, green state.
Update `PROJECT_STATE.md` before stopping. A clean handoff mid-plan is fine; a
half-finished block with no note is not.
