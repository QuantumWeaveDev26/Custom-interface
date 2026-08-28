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

### F2 — API route test coverage ✅ MOSTLY DONE (2026-08-28, `eb04cad`)
Covered the two paths that matter most: job submission (the credit debit) and
asset access (the cross-user boundary). 51 web tests, was 37.

`jobs.ts` and `assets.ts` now take injected dependencies instead of importing
Prisma/BullMQ directly; job submission's composition root moved to
`job-dependencies.ts`. The fake store runs the *real* `submitJob` transaction
logic and rolls back on throw — an earlier version didn't, and reported a debit
Postgres would have undone.

Each guard was verified to actually fail when deliberately broken:
model-capability validation, enqueue compensation, asset ownership.

**Still open:** `/api/transcribe` and `/api/voice-clone` server modules are
untested — they need the same DI treatment. Route handlers themselves (auth
rejection) remain untested; the logic beneath them is covered.

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
| **R3** | Seedream **multi-reference image-to-image** | C4 (Soul ID equivalent) |
| ~~**R4**~~ | ✅ Covered by the same R2 doc read — `seedance-2-0-fast` supports Edit video and Extend video. Exact request shapes for those two still need a targeted read. | C6 |
| **R5** | 3D generation (Rodin / Hitem3d) endpoints + quota metering | C8 |
| **R6** | `skylark-embedding-vision` request shape | C7 |
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

**Still open in this area:** first+last-frame keyframes are supported by the
worker (`role: "last_frame"` is wired and tested) but have no UI yet — only a
first frame is selectable. `ratio: "adaptive"` is still not exposed. Both are
small follow-ons.

### C3 — Upload pipeline
Users must be able to bring their own images/audio, not only use generated
assets. Needed by C2, C4, and lipsync. Reuses the TOS + signed-URL pattern
already proven in `/transcribe`.

### C4 — Character consistency (Soul ID equivalent) ⭐ headline feature
Seedream multi-reference image-to-image: save a named character from reference
images, reuse across generations. Needs R3 and C3.

### C5 — Cinema Studio depth
Expand `packages/prompt-library` toward Higgsfield's ~70 presets: camera bodies,
lens types, aperture/DoF, and stacking multiple moves per shot. Pure prompt
engineering — no new API surface, so it can proceed in parallel.

### C6 — Video extension and editing
Extend a clip past its end; edit an existing clip. Needs R4 and A2's input-asset
support.

### C7 — Community / explore feed
Semantic search and "more like this" over generated assets via
`skylark-embedding-vision`. Needs R6. Overlaps Phase 4's community goal.

### C8 — 3D generation 🟢 differentiator
Text-to-3D and image-to-3D with PBR materials and glb/obj/fbx/usdz export.
**Higgsfield does not offer this.** Free-tier quota available. Needs R5.

### C9 — Batch generation / variants
Seedream batch modes — N variants per prompt, a standard expectation in this
product category.

---

## Blocked work

### B1 — Voice Cloning
Blocked on BytePlus support. Four hypotheses already ruled out — read
`PROJECT_STATE.md` §3.1 before touching. Support message draft is there too.
**Follow-on:** surface cloned voices as selectable speakers in Studio.

### B2 — Lipsync / talking avatar (OmniHuman)
Blocked on model ID confirmation via Model Square (folds into R1). Higgsfield's
Lipsync Studio equivalent.

### B3 — Phase 4: Billing, Admin
Blocked on payment provider, pricing tiers, and audience (real customers vs
internal demo). `ARCHITECTURE.md` §8 notes the 100-credit welcome grant needs a
signup-abuse guard before any public launch.

---

## Polish backlog
- **P1** Responsive pass — `sm:` breakpoints exist, never checked on a real device
- **P2** Empty/error states for Director, Marketing, Transcribe (Gallery has one)
- **P3** Accessibility — focus rings, keyboard nav, `aria-live`, contrast audit

---

## Recommended order

```
F3  ✅ done
A2  ✅ done — Phase C is unblocked
F1  ─→ user, today (security)
R1  ─→ user, today (Model Square — gates all research)
C1  ✅ done
F2  ✅ mostly done (transcribe/voice-clone modules still open)
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
