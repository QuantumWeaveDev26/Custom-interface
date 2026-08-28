# Build Plan

Forward-looking, block by block. Pairs with `PROJECT_STATE.md` (current status)
and `ARCHITECTURE.md` (design).

---

## How to use this plan

**One block at a time. Finish it. Verify it. Commit it. Then start the next.**

This project previously drifted into reactive work — build a feature, hit a
BytePlus surprise, chase it, repeat — with no plan surviving a session boundary.
That is what this file prevents.

**A block is done when all four are true:**
1. The stated deliverable exists.
2. `pnpm typecheck && pnpm test && pnpm build` all pass.
3. Any new behavior has a test, or an explicit written note saying why it can't
   be unit-tested (e.g. needs a live third-party call).
4. It is committed and pushed with a message explaining *why*, not just what.

**Never mark a block done on the basis of "it should work."** This project has
been burned by exactly that.

---

## Foundation blocks — do these first

These harden the base. They are deliberately ahead of new features because the
project currently has real feature surface with thin structural support.

### F1 — Rotate exposed API credentials 🔴 SECURITY, DO FIRST

**Problem:** `ARK_API_KEY` and `BYTEPLUS_VOICE_API_KEY` values have been visible
in plaintext in shared screenshots of `apps/web/.env`. They are correctly
gitignored and were never committed, but screenshot exposure is still exposure —
these map to real, billable BytePlus spend.

**Deliverable:** both keys rotated in the BytePlus console; new values placed in
`apps/web/.env` and `apps/worker/.env`; old keys revoked; app reverified working.

**Done when:** an image generation and a voice generation both succeed with the
new keys, and the old keys are confirmed revoked in the console.

**Owner:** user (console access required).

---

### F2 — Test coverage for API routes

**Problem:** all 34 `apps/web` tests cover state reducers only. Every API route
is untested — including `/api/jobs`, which performs the credit debit. The
riskiest financial logic in the app has no route-level test.

**Deliverable:** tests for `/api/jobs` (auth rejection, invalid body, insufficient
credits, in-flight cap, happy path shape), `/api/transcribe`, `/api/voice-clone`
(consent gate rejection), and `/api/assets/[id]` (cross-user access must 404).

**Done when:** those routes have tests, `pnpm test` passes, and a deliberate
break in each guard makes its test fail.

**Note:** requires deciding how to fake `auth()` and Prisma at the route
boundary — prefer dependency injection over module mocking, matching the
injectable-client pattern already used in `modelark-client` / `voice-client`.

---

### F3 — Continuous integration ✅ DONE (2026-08-28)

**Problem:** no CI. Every verification is manual and local. Any agent — Claude,
Codex, Antigravity — can push a regression undetected.

**Delivered:** `.github/workflows/ci.yml` runs install → `db:generate` →
typecheck → test → build on push to `main`, on PRs to `main`, and on
`ci-verify/**` scratch branches.

**Verified both directions:**
- Green on `main` @ `f833ef8` — all steps confirmed executed, none skipped.
- Red on a scratch branch carrying a deliberate type error, then the branch was
  deleted. A CI that cannot fail is worse than no CI; this one fails correctly.

**Notes for whoever touches it next:**
- Dummy env vars are supplied because `packages/db` instantiates `PrismaClient`
  at module scope and Next.js imports route modules during `next build`. They
  are placeholders; nothing in CI contacts a live service.
- `pnpm db:generate` must run before typecheck — Prisma's generated types are
  not produced by the turbo pipeline.
- To change this workflow safely, push to a `ci-verify/**` branch first.

**Why this mattered for agent-portability:** CI is the one guardrail that works
identically no matter which AI is driving. It is the cheapest insurance against
a handoff going wrong.

---

### F4 — Deployment path

**Problem:** nothing is deployed. `ARCHITECTURE.md` §2 specifies Vercel (web) +
BytePlus ECS (worker/Redis/Postgres), but `infra/` contains only
`docker-compose.yml` for local dev. The system has never run outside this
machine.

**Deliverable:** decide staged vs full, then execute. Suggested minimum first
step — deploy `apps/web` to Vercel with a managed Postgres and Redis, worker
still local — to prove the app runs off-machine before taking on ECS.

**Done when:** a URL other than `localhost` serves the app and completes one real
generation end-to-end.

**Blocked on:** a decision about hosting spend, and whether this needs to be
publicly reachable yet.

---

## Verification block

### V1 — Close the two open verification gaps

`PROJECT_STATE.md` §2 lists two features that are built and tested but never
confirmed live. Both are cheap to check and both currently sit in an ambiguous
state that will only get more expensive to untangle later.

1. **Expressive TTS** — `/studio` → Voice → Expressive → generate. Was broken
   live once, fixed in `06240ec`, never retested.
2. **Speech-to-Text** — `/transcribe`, upload any spoken-word audio file.

**Done when:** both produce correct output in the browser, and
`PROJECT_STATE.md` §2 is updated to move them into "Verified live" — or a real
bug is found and filed as its own block.

**Owner:** user (browser), with agent standing by to fix.

---

## Blocked work

Do not start these. Each needs something from outside the codebase.

### B1 — Voice Cloning completion
**Blocked on:** BytePlus support. Full diagnostic history in
`PROJECT_STATE.md` §3.1 — read it before touching this, four hypotheses are
already ruled out.

**Support message to send (user action):**
> `POST /api/v3/tts/voice_clone` (Voice Replication) fails with
> `{"code":55000000,"message":"resource ID is mismatched with speaker related resource"}`
> (HTTP 500) when called via the documented REST API using our project's API key,
> even though the request exactly matches your own "Voice Training" API
> documentation sample (`speaker_id: ""`, `audio.data`/`audio.format`,
> `language`, `extra_params.demo_text`). The identical voice sample succeeds when
> cloned through the Voice Replication console UI directly. Error code 55000000
> does not appear in your published Voice Replication error code reference. Can
> you confirm whether the REST API requires additional account/project
> configuration beyond what's documented, or whether this is a bug on your end?

**Follow-on once unblocked:** surface cloned voices as selectable speakers in
Studio's Voice tab (currently the speaker is hardcoded in `VOICE_PROFILE`).

### B2 — Avatar (OmniHuman)
**Blocked on:** user confirming the model ID exists in Console → ModelArk →
Model Square. See `PROJECT_STATE.md` §3.2. Writing code before this repeats a
mistake already made once on this project.

### B3 — Phase 4: Billing, Admin, Community
**Blocked on:** payment provider, pricing tiers, and audience (real customers vs
internal demo). See `PROJECT_STATE.md` §3.3.

**Note:** `ARCHITECTURE.md` §8 flags that the 100-credit welcome grant needs a
signup-abuse guard before any public launch, since those credits map to real
BytePlus spend. That belongs in this block.

---

## Polish backlog

Real work, but lower priority than the foundation blocks. Not blocked.

- **P1 — Responsive pass.** The design system landed with `sm:` breakpoints but
  has never been checked on a real mobile viewport.
- **P2 — Empty and error states.** Gallery has a designed empty state; Director,
  Marketing, and Transcribe do not.
- **P3 — Accessibility pass.** Focus rings, keyboard nav through the Studio mode
  pills, `aria-live` coverage on async regions, contrast audit against the dark
  palette.

---

## Recommended order

```
F3 (CI)              ───→ ✅ DONE 2026-08-28
F1 (security, user)  ─┐
V1 (verify, user)    ─┴─→ user actions, can run in parallel with agent work
F2 (route tests)     ───→ agent work, no blockers — NEXT
F4 (deploy)          ───→ needs a hosting decision first
B1/B2/B3             ───→ external unblock required
P1/P2/P3             ───→ after foundation
```

**If credits/session budget run short mid-block:** stop at a committed, green
state rather than leaving a block half-done. Update `PROJECT_STATE.md` before
stopping. A clean handoff mid-plan is fine; a half-finished block with no note
is not.
