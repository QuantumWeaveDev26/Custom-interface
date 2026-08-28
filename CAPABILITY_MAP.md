# Capability Map — BytePlus inventory vs Higgsfield parity

**Purpose:** the project's goal is a Higgsfield-grade platform built on *everything*
BytePlus offers. This file inventories what BytePlus actually provides, what
Higgsfield does, and where the gaps are — so the roadmap is driven by the real
catalog rather than the three APIs we happened to start with.

Created 2026-08-28. Sources: BytePlus [Model list](https://docs.byteplus.com/en/docs/ModelArk/1330310)
(official docs, read directly) and published Higgsfield feature coverage.

**Status of everything here: DOCUMENTED, NOT LIVE-TESTED.** Per this project's
standing rule (`PROJECT_STATE.md` §1), BytePlus docs have repeatedly differed
from real API behavior. Treat every capability below as a lead to verify, not a
guarantee.

---

## 1. The honest headline

We are currently using roughly **15%** of what the platform offers. Every
generation feature we've built uses the simplest mode of its model:

| Model | Modes available | Modes we use |
|---|---|---|
| Seedance (video) | 7 | 1 (text-to-video) |
| Seedream (image) | 5–8 | 1 (text-to-image) |
| Seed Speech | 4 | 3 |
| 3D (Rodin / Hitem3d) | 8 | 0 |
| Multimodal embedding | 1 | 0 |

We also hardcode the *cheapest, smallest* output settings — 5s / 720p video when
Seedance 2.5 supports **4–30s at up to 1080p**, and Seedance 2.0 supports **4K**.

---

## 2. BytePlus catalog — what's actually available

### 2.1 Video — Seedance
`dreamina-seedance-2-5-260628` (4–30s, up to 1080p 10-bit, .mp4/.mov)
`dreamina-seedance-2-0-260128` (4–15s, up to **4K**), plus `-fast` and `-mini` variants.

All Seedance 2.x models support **seven modes**:

| Mode | We use it? | Higgsfield equivalent |
|---|---|---|
| Text-to-video | ✅ yes | base generation |
| **Image-to-video — first frame** | ❌ no | *core Higgsfield workflow* |
| **Image-to-video — first + last frames** | ❌ no | keyframe / transition control |
| **Reference-to-video** | ❌ no | style & subject reference |
| **Multimodal reference-to-video** | ❌ no | combined image+text conditioning |
| **Video editing** | ❌ no | edit an existing clip |
| **Video extension** | ❌ no | extend a clip past its original end |

> Image-to-video is the single biggest gap. It is how Higgsfield users actually
> work — generate or upload a still, then animate it — and we don't support it
> at all despite the model doing it natively.

### 2.2 Image — Seedream
`dola-seedream-5-0-pro-260628`, `seedream-5-0-260128` / `-lite`, `seedream-4-5`, `seedream-4-0`

| Mode | We use it? | Higgsfield equivalent |
|---|---|---|
| Text-to-image | ✅ yes | base generation |
| **Single image-to-image** | ❌ no | edit / restyle / variation |
| **Multi-reference image-to-image** | ❌ no | **character consistency ≈ Soul ID** |
| **Batch generation** (from text, image, or multi-ref) | ❌ no | generate N variants per prompt |
| **Layer decomposition** (5.0-pro only) | ❌ no | no Higgsfield equivalent — differentiator |

> Multi-reference image-to-image is the most strategically important item in this
> document. Higgsfield's headline feature is **Soul ID** — upload 3–5 photos,
> get a character reusable across every tool. Seedream's multi-reference mode is
> the primitive that makes an equivalent possible.

### 2.3 3D — completely untouched
`Hyper3d-Rodin-Gen2` — text-to-3D and image-to-3D; white model, textured, PBR
materials; exports glb/obj/stl/fbx/usdz. Free quota 150K.
`Hitem3d-2.0` — image-to-3D, up to 2M polygons, high-precision modes. Free quota 500K.

> **Higgsfield does not offer 3D.** This is a genuine differentiator available to
> us for free-tier quota, not just parity.

### 2.4 Multimodal embedding — untouched
`skylark-embedding-vision-251215` — vectorizes **video, image, and text** together,
2048 dims, 128K context.

> This is the missing primitive for a community/explore feed: semantic search over
> generated assets, "more like this," dedupe, and content-based recommendations.

### 2.5 Text / reasoning — barely tapped
Large roster (Dola-Seed-2.1-turbo, Seed 2.0 family, DeepSeek v4, GLM 5.2, plus
vision-capable Seed 1.6). We use exactly one model for two agents.

Notably available and unused: **function calling + MCP**, **structured output
(json_schema)**, **context caching** (prefix + session), **audio understanding**,
**visual grounding**, **video understanding**.

> Structured output would replace the hand-rolled JSON parsing in
> `packages/agents`. Context caching would cut agent cost materially.

### 2.6 Platform services not yet evaluated
From the ModelArk console nav and BytePlus product grid — **none investigated**:
- **Managed Agents** — agent definition, environments, task delegation, context management
- **App Lab**, **Knowledge base**, **PromptPilot**
- **Batch inference** / **Model Units** (cost control at volume)
- **ArkClaw** — BytePlus's own cloud agent service
- **Cloud Identity / Organization / Cloud Trail** — relevant to Phase 4 admin

### 2.7 Seed Speech (separate product — we use most of it)
TTS ✅, Expressive TTS ✅, ASR ✅, Voice Replication ⚠️ (blocked, see `PROJECT_STATE.md` §3.1).

---

## 3. Higgsfield parity gap

| Higgsfield feature | BytePlus primitive | Status |
|---|---|---|
| Cinema Studio — 70+ camera presets | prompt engineering | ⚠️ partial (`packages/prompt-library` has a small set) |
| Camera bodies / lens / aperture / DoF | prompt engineering | ❌ not built |
| Stack up to 3 camera moves per shot | prompt engineering | ❌ not built |
| **Soul ID — character consistency** | **Seedream multi-reference i2i** | ❌ not built, primitive exists |
| **Image-to-video** | **Seedance i2v first frame** | ❌ not built, primitive exists |
| Keyframe / transition control | Seedance first+last frame | ❌ not built, primitive exists |
| Video extension | Seedance video extension | ❌ not built, primitive exists |
| Video editing | Seedance video editing | ❌ not built, primitive exists |
| Lipsync / talking avatar | OmniHuman | ⛔ blocked — model ID unconfirmed |
| Face swap | likely multi-ref i2i | ❓ not investigated |
| Marketing Studio (URL → ad) | chat + generation | ✅ **built and live** |
| Shot planning / director | chat + generation | ✅ **built and live** |
| Long video (30s) | Seedance 2.5 | ❌ hardcoded to 5s |
| 1080p / 4K output | Seedance 2.0/2.5 | ❌ hardcoded to 720p |
| Batch / variants | Seedream batch | ❌ not built, primitive exists |
| Upscaling | — | ❓ no clear primitive found |
| Community / explore feed | skylark embeddings | ❌ not built, primitive exists |
| Multi-model routing | full ModelArk roster | ❌ single model per job type |
| — | **3D generation** | 🟢 **available, Higgsfield lacks it** |

---

## 4. What this means architecturally

The current design cannot express most of the gaps above. Three concrete
blockers in our own code, all of which need fixing before the feature work:

**4.1 Generation settings are hardcoded, not per-job.**
`packages/shared-types/src/jobs.ts` freezes `IMAGE_PROFILE` / `VIDEO_PROFILE`
(5s, 720p, 21:9). Duration, resolution, and aspect ratio must become per-job
parameters — validated server-side, never client-trusted.

**4.2 Jobs cannot take assets as input.**
`inputParams` is `{ prompt, voiceStyle? }` — text only. Image-to-video,
multi-reference, video extension, and editing all require a job to reference one
or more existing assets. This needs a real input-asset relationship in the schema,
plus ownership checks so a user cannot reference another user's asset.

**4.3 Credit cost is a flat per-type constant.**
`IMAGE_COST` / `VIDEO_COST` are fixed. Real cost scales with duration ×
resolution × model — a 30s 1080p clip is not a 5s 720p clip. `ARCHITECTURE.md`
§8 already warns that model and cost are coupled; variable parameters make a
proper cost function mandatory rather than optional.

> These three are why the roadmap must do a schema/contract pass **before**
> adding features. Bolting image-to-video onto the current shape would mean
> rewriting it immediately afterward.

---

## 5. Verification needed before building

Nothing here is live-confirmed. Ordered by how much depends on it:

1. **Seedance image-to-video** — exact request shape for first-frame and
   first+last-frame modes. Unblocks the largest feature gap.
2. **Seedream multi-reference i2i** — how references are passed, how many are
   allowed. Unblocks the Soul ID equivalent.
3. **Which models this account can actually call** — the docs list the catalog;
   Model Square shows what's activated for *this* account. A model in the docs is
   not necessarily callable here.
4. **Seedance video extension / editing** — request shape, and whether input must
   be a BytePlus-hosted URL.
5. **3D generation** — endpoint shape and how the free quota is metered.
6. **Managed Agents / App Lab** — whether they replace or complement
   `packages/agents`.

`MODELARK_API_REFERENCE.md` currently documents only text-to-image and
text-to-video. It needs extending as each of the above is confirmed.
