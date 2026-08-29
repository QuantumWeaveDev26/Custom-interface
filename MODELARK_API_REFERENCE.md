# ModelArk API Reference — verified field-level schema

**Source of truth for this document:** BytePlus's official open-source Go SDK
(`github.com/byteplus-sdk/byteplus-go-sdk-v2`, package `service/arkruntime/model`),
which is machine-generated from BytePlus's real OpenAPI spec. Browsable at
https://pkg.go.dev/github.com/byteplus-sdk/byteplus-go-sdk-v2/service/arkruntime/model
— that page is a static Go doc site (not JS-rendered like docs.byteplus.com), so it's
fetchable/scrapable reliably by any tool, including Codex, if you need to re-verify or
go deeper (e.g. the `responses`, `file`, or `contextmanagement` sub-packages this doc
doesn't cover).

This gives Codex exact field names for the core Phase-1 endpoints without depending on
BytePlus's docs site, which is a JS single-page app — plain `curl`/`fetch` against
`docs.byteplus.com` URLs returns an empty page shell, not the real content. If Codex
tries to "read the docs" by fetching those URLs directly, it will get nothing useful.

## What's still unverified — confirm before relying on it

**Update:** the URL paths below were confirmed by directly inspecting BytePlus's SDK
(via Codex) — `/contents/generations/tasks` for video, `/images/generations` for image,
with the list call being `GET /contents/generations/tasks` + query params rather than a
POST body. Field names inside each payload (documented below) are still sourced from the
Go SDK's type definitions and should still be treated as the payload shape, just note the
corrected paths.

Still **not yet confirmed**: the exact model ID strings enabled on *your* account.
BytePlus's own docs/SDK examples show `seedream-5-0-lite-260128` (image) and
`dreamina-seedance-2-5-260628` (video) as illustrative IDs — these are not guaranteed to
be what's actually enabled for you. Confirm via Console → ModelArk → Model list (open
the model card for whichever Seedream/Seedance tier you want — the exact ID string,
including its date-suffix, is shown there) before hardcoding either ID.

## Auth & base URL

```
Base URL: https://ark.ap-southeast.bytepluses.com/api/v3
Header:   Authorization: Bearer $ARK_API_KEY
```

Go SDK client init (for reference — you're building in TypeScript, but this confirms
the base URL and auth pattern):
```go
client := arkruntime.NewClientWithApiKey(
    os.Getenv("ARK_API_KEY"),
    arkruntime.WithBaseUrl("https://ark.ap-southeast.bytepluses.com/api/v3"),
)
```

---

## Video / multimodal generation ("Content Generation" API)

This is **asynchronous** — create a task, then poll it.

### Create task — request

| Field | Type | Notes |
|---|---|---|
| `model` | string | required |
| `content` | array of content items | required — see below |
| `safety_identifier` | string? | |
| `callback_url` | string? | webhook instead of polling, if supported |
| `return_last_frame` | bool? | |
| `service_tier` | string? | |
| `execution_expires_after` | int64? | |
| `priority` | int32? | |
| `generate_audio` | bool? | |
| `draft` | bool? | |
| `camera_fixed` | bool? | |
| `watermark` | bool? | |
| `seed` | int64? | |
| `resolution` | string? | e.g. "480p" / "720p" / "1080p" |
| `ratio` | string? | aspect ratio |
| `duration` | int64? | seconds |
| `frames` | int64? | |

**Content item** (each entry in the `content` array):

| Field | Type |
|---|---|
| `type` | `"text"` \| `"image_url"` \| `"audio_url"` \| `"video_url"` \| `"draft_task"` |
| `text` | string? |
| `image_url` | `{ url: string }`? |
| `audio_url` | `{ url: string }`? |
| `video_url` | `{ url: string }`? |
| `role` | string? |
| `draft_task` | `{ id: string }`? |

### Create task — response
```
{ "id": "string", "safety_identifier": "string?" }
```

### Get task — response

| Field | Type |
|---|---|
| `id`, `model` | string |
| `status` | `"succeeded"` \| `"cancelled"` \| `"failed"` \| `"running"` \| `"queued"` |
| `error` | `{ code, message }`? — present when `status: "failed"` |
| `content` | `{ video_url, last_frame_url, file_url }` |
| `resolution`, `ratio` | string? |
| `duration`, `frames`, `frames_per_second` | number? |
| `created_at`, `updated_at` | unix timestamp |
| `seed` | number? |
| `revised_prompt` | string? |
| `draft`, `draft_task_id` | |

### List tasks — request/response
`GET /contents/generations/tasks` with query parameters (page_num, page_size, and filter
fields such as status/model/task_ids — exact query-param naming for the filter still
needs confirming against a live call; Codex flagged this as corrected from an earlier
assumed POST-with-body shape, but didn't confirm the individual param names).
Response: `{ total: number, items: [...same shape as Get task, plus failure_reason instead of error] }`

### Delete/cancel task
`{ "id": "string" }`

---

## Image generation

**This one is synchronous** — no task/poll cycle, the image comes back in the response.

### Request

| Field | Type | Notes |
|---|---|---|
| `model` | string | required |
| `prompt` | string | required |
| `image` | string \| string[]? | reference image(s) for image-to-image |
| `response_format` | `"url"` \| `"b64_json"`? | |
| `seed` | number? | |
| `guidance_scale` | number? | |
| `size` | string? | e.g. `"1024x1024"`, or `"adaptive"` |
| `watermark` | bool? | |
| `optimize_prompt` | bool? | |
| `sequential_image_generation` | `"auto"` \| `"disabled"`? | generate a related batch in one call |
| `sequential_image_generation_options` | `{ max_images? }` | |
| `output_format` | `"jpeg"` \| `"png"`? | |

### Response
```
{
  "model": "string",
  "created": 0,
  "data": [{ "url": "string?", "b64_json": "string?", "size": "string" }],
  "usage": { "generated_images": 0, "output_tokens": 0, "total_tokens": 0 },
  "error": { "code": "string", "message": "string" }
}
```

---

## Chat / reasoning (Phase 2/3 — Director and Marketing agents)

Fully OpenAI-compatible. Either use the official `openai` npm package pointed at the
ModelArk base URL, or call `/chat/completions` directly with standard OpenAI-shaped
`{ model, messages, tools, tool_choice, ... }`. Standard fields: `role`
(`system`/`user`/`assistant`/`tool`), `content`, `tool_calls`, `function_call`. Supports
streaming, `response_format` (including `json_schema` for structured output), and
`thinking: { type: "enabled" | "disabled" | "auto" }` to toggle deep reasoning.

**Confirmed model ID** (Console → ModelArk → Model Square, verified live):
`dola-seed-2-1-turbo-260628` ("Dola-Seed-2.1-turbo", Reasoning / Coding and Agent
model, text-in text-out, 256k context). $0.5/M input tokens, $2.5/M output tokens.

---

## Confirmed available models for this account (from console, 2026-08-26)

Verified directly in Console → ModelArk → Home / Model Square. The version suffix shown
in the console (e.g. `260128`) matches the date-suffix format in the model ID strings
Codex found in BytePlus's docs — strong confirmation these are the real API model IDs.

| Display name | Version | Likely API model ID | Sample settings | Est. cost |
|---|---|---|---|---|
| Dreamina-Seedance-2.0-fast | 260128 | `dreamina-seedance-2-0-fast-260128` (derive by analogy — confirm) | 5s, 720p, 21:9 | $0.54 |
| Dreamina-Seedance-2.5 | 260628 | `dreamina-seedance-2-5-260628` (confirmed, matches Codex's find) | 15s, 720p, 16:9 | $3.46 |
| Dola-Seedream-5.0-lite | 260128 | `seedream-5-0-lite-260128` (confirmed, matches Codex's find) | 4K, 1:1 | $0.04 |
| Dola-Seedream-5.0-pro | 260628 | `seedream-5-0-pro-260628` (derive by analogy — confirm) | ≤2.61MP, 1:1 | $0.04 |

**Cost note:** Seedance 2.5 runs ~2x the per-second cost of 2.0-fast ($0.23/s vs $0.11/s
at these settings). Seedream lite and pro cost the same at the settings shown.

**Phase 1 recommendation:** build and test the pipeline against **Seedance 2.0-fast**
and **Seedream 5.0-pro** to keep iteration cheap, then switch the default model ID to
Seedance 2.5 once the end-to-end flow works and you're ready to judge real output
quality. This is a one-line config change (the `model` field in the request), not a
code change — keep the model ID out of hardcoded logic, pass it as a parameter/env var
per job type so swapping tiers later doesn't touch the pipeline code.

**Before hardcoding any "derive by analogy" ID above:** open that model's card in
Console → ModelArk → Model list and look for an "Access"/"API" tab or code sample —
it usually shows the literal model ID string used in the `model` field. Confirm rather
than trust the derived pattern.

## Task status constants (exact strings, confirmed)

```
succeeded | cancelled | failed | running | queued
```

Use these exact strings when mapping ModelArk's task status onto your own `Job.status`
enum in the Prisma schema (`queued` / `processing` / `complete` / `failed` — map
`running`→`processing`, `succeeded`→`complete`, `cancelled`/`failed`→`failed`).

---

## Image-to-video and references (R2) — CONFIRMED via official docs, 2026-08-28

Source: BytePlus ModelArk "Video generation" docs, read directly. **Documented,
not yet exercised by a live call from this project.**

### Same endpoint, extra content items

Image-to-video is not a separate endpoint — it is the existing
`POST /contents/generations/tasks` with additional entries in `content[]`.

**First frame only** (animate a still):
```json
{
  "model": "dreamina-seedance-2-0-fast-260128",
  "content": [
    { "type": "text", "text": "the girl opens her eyes and looks at the camera" },
    { "type": "image_url", "image_url": { "url": "https://..." } }
  ],
  "generate_audio": true,
  "ratio": "adaptive"
}
```

**First and last frame** (keyframe / transition control) — uses an explicit
`role` on each image item:
```json
{
  "content": [
    { "type": "text", "text": "..." },
    { "type": "image_url", "image_url": { "url": "..." }, "role": "first_frame" },
    { "type": "image_url", "image_url": { "url": "..." }, "role": "last_frame" }
  ],
  "generate_audio": true,
  "ratio": "adaptive",
  "duration": 5,
  "watermark": true
}
```

Confirmed `role` values: **`first_frame`**, **`last_frame`**. These match the
`InputAssetRole` values already defined in `packages/shared-types/src/generation.ts`.

### `ratio: "adaptive"`

A documented ratio value beyond the fixed list — matches the source image's
aspect ratio. Intended for image-driven generation. **Not yet added to
`VIDEO_RATIOS`**; add it when C2 wires image-to-video, where it is the sensible
default.

### Our current model already supports far more than we use

`dreamina-seedance-2-0-fast-260128` — the model this project runs today — is
documented as supporting **all** of:

| Capability | Supported |
|---|---|
| Text to video | ✓ (only one we use) |
| Image to video — first frame | ✓ |
| Image to video — first and last frames | ✓ |
| Omni reference — image | ✓ |
| Omni reference — video | ✓ |
| Omni reference — audio | ✗ (must accompany an image or video) |
| Combined reference (image+audio, image+video, video+audio, all three) | ✓ |
| Edit video | ✓ |
| Extend video | ✓ |
| Generate video with audio | ✓ |
| Return last frame of output | ✓ |

**Consequence:** C2 (image-to-video), C6 (edit/extend), and reference-driven
generation do **not** require upgrading to Seedance 2.5. The cheap model already
does them. The 2.5 upgrade buys 30s duration and 1080p, nothing more for these
features.

### Aspect ratio correction

Documented ratios for every Seedance model: `21:9`, `16:9`, `4:3`, `1:1`,
**`3:4`**, `9:16`. This project's `VIDEO_RATIOS` was missing `3:4` — a real gap,
since `3:4` is a common portrait format.

---

## Multi-reference image-to-image (R3) — CONFIRMED via official docs, 2026-08-29

Source: BytePlus ModelArk "Image generation API" docs, read directly.
**Documented, not yet exercised by a live call from this project.**

Same `POST /images/generations` endpoint as text-to-image. The only difference
is the `image` parameter, documented as **`string | string[]`** ("Reference
image"). Passing an array is multi-reference:

```json
{
  "model": "dola-seedream-5-0-pro-260628",
  "prompt": "Replace the clothing in image 1 with the outfit from image 2.",
  "image": ["https://.../ref1.png", "https://.../ref2.png"],
  "size": "2K",
  "output_format": "png",
  "watermark": false
}
```

Notes:
- The prompt can address the references positionally — "image 1", "image 2" —
  so **array order is meaningful** and must be preserved. This is why
  `JobInputAsset.position` exists.
- References are fetched by BytePlus, so they must be publicly reachable URLs.
  Our assets are private, so each must be signed first (same as image-to-video).
- `packages/modelark-client` already types `image?: string | string[]`, so no
  client change was needed.
- **`seedream-5-0-lite-260128` — the model this project already runs — supports
  multi-reference image-to-image** per the model list. No upgrade required, and
  no move to the pricier `5-0-pro` (whose extra draw is layer decomposition).

### Documented modes on this endpoint we still do not use

`Single image-to-image` (one reference), `Multi-Image Blending`,
`Multi-Reference Image-to-Batch-Image`, `Layer decomposition` (5.0-pro only),
`sequential_image_generation` (batch variants), and streaming output.

---

## Video edit / extend / omni reference (R4) — CONFIRMED via official docs, 2026-08-29

Source: BytePlus ModelArk "Dreamina Seedance 2.0 series tutorial" (doc 2291680),
read directly. **Documented, not yet exercised by a live call from this project.**

Same `POST /contents/generations/tasks` endpoint as text-to-video. What changes
is the `content[]` items and their `role`.

### Role values on the wire

These are **not** the same strings as the `InputAssetRole` values this project
stores. Map at the worker boundary:

| Our `InputAssetRole` | Wire `role` | Content item type |
|---|---|---|
| `first_frame` | `first_frame` | `image_url` |
| `last_frame` | `last_frame` | `image_url` |
| `reference` | `reference_image` | `image_url` |
| `source_video` | `reference_video` | `video_url` |
| (none yet) | `reference_audio` | `audio_url` |

A bare `image_url` with **no** role is treated as a first frame. So an omni
reference image sent without `role: "reference_image"` is silently misread as a
keyframe — which is what this project was doing before R4.

### Edit video

Text + the video to edit + optional reference images:
```json
{
  "model": "dreamina-seedance-2-0-260128",
  "content": [
    { "type": "text", "text": "Replace the cat in [Video 1] with the lion from [Image 1]." },
    { "type": "image_url", "image_url": { "url": "..." }, "role": "reference_image" },
    { "type": "video_url", "video_url": { "url": "..." }, "role": "reference_video" }
  ],
  "generate_audio": true, "ratio": "16:9", "duration": 5
}
```

### Extend video

Text + **1–3** videos, all `role: "reference_video"`. With one video it extends
forward or backward; with 2–3 it generates the transitions between them.
```json
{
  "content": [
    { "type": "text", "text": "The window in [Video 1] opens ... transitioning into [Video 2]." },
    { "type": "video_url", "video_url": { "url": "..." }, "role": "reference_video" },
    { "type": "video_url", "video_url": { "url": "..." }, "role": "reference_video" }
  ]
}
```

Documented behaviour worth surfacing in UI copy: extending one clip usually
yields **only the new footage**, not the original plus the new. To keep the
original, the prompt must say so ("...and then end with Video 1"). With 2–3
clips the output does include the originals.

### Omni reference

Same shape, mixing modalities. Prompts address inputs positionally as
`[Image 1]`, `[Video 1]`, `[Audio 1]` — the number is the order among items *of
that type* in the request body.

Per-request caps for the **2.0 series** (what we run): 0–9 images, 0–3 videos,
0–3 audio. Seedance 2.5 allows 1–30 images and 10 videos/audio. `text + audio`
and audio-only inputs are rejected.

For strict keyframe control the docs say to use `first_frame`/`last_frame`
rather than describing it in the prompt.

### Input limits (all modalities)

- **Images:** jpeg/png/webp/bmp/tiff/gif (2.0 also heic/heif); aspect ratio
  0.4–2.5; 300–6000 px per side; < 30 MB each.
- **Videos:** mp4/mov, H.264 or H.265, audio AAC/MP3; 2–15 s each for the 2.0
  series, ≤ 15 s total across clips; 480p–4K; 24–60 fps; < 200 MB each.
- **Audio:** wav/mp3; 2–15 s each for the 2.0 series.
- **Request body must stay under 64 MB** — do not base64 large files, send URLs.
- Input may also be an **asset id**, passed as `asset://<asset ID>` in the same
  `url` field.

---

## Real human faces in input (R8) — CONFIRMED live + docs, 2026-08-29

Seedance 2.5 and the 2.0 series **reject input images or videos that may contain
a real human face**. Confirmed live by this project on a keyframe job:

```json
{"error":{"code":"InputImageSensitiveContentDetected.PrivacyInformation",
"message":"The request failed because the input image 'content[1]' may contain real person."}}
```

Source for the workarounds: "Create portrait videos with Dreamina Seedance
models" (doc 2608626).

### Workaround 1 — trusted outputs

ModelArk trusts **its own face-containing outputs, on the same account**, as
input for secondary creation:

| Trusted input | Trusted if generated after | Valid for |
|---|---|---|
| Face-containing videos from Seedance 2.5 / 2.0 series | 2026-03-11 | 30 days |
| Last-frame images of those videos | 2026-04-16 | 30 days |
| Face-containing images from **Seedream 5.0 lite text-to-image** | 2026-04-16 | 30 days |

Constraints, all of which matter to how this project stores assets:
- Same account only; cross-account and cross-platform are not trusted.
- **Original outputs only** — secondary editing breaks trust.
- "Compressing or forwarding files may invalidate trust verification. We
  recommend saving the original model outputs directly to BytePlus TOS."
- Trust covers the *input*; output can still fail moderation.

**Open question this project must answer with a live test:** we download each
generated image and re-upload the bytes to our own TOS bucket, then hand
BytePlus a signed URL. Whether that counts as "forwarding" and breaks trust is
unknown. The one live data point we have — an astronaut image generated by
`seedream-5-0-lite` on this account, re-served from our bucket — was **rejected**,
which is weak evidence that it does. Before building any face feature, test the
same image served straight from the BytePlus-issued URL.

### Workaround 2 — preset digital characters

A library of sanctioned character assets, passed as `asset://<asset ID>`. This
is the closest documented equivalent to a consistent human identity, and it is
allowed by design rather than by trust heuristics. Requires activating the
Digital Character Library in the console.

Prompts must address them by type + position ("the influencer in Image 1"),
never by asset id.

---

## Batch image generation (R9) — CONFIRMED via official docs, 2026-08-29

Source: ModelArk "Image generation tutorial" (1824121) and the Image generation
API reference (1541523). **Documented, not yet exercised by a live call.**

Same `POST /images/generations` endpoint, two extra fields:

```json
{
  "model": "seedream-5-0-lite-260128",
  "prompt": "a set of four cinematic sci-fi storyboard scenes ...",
  "sequential_image_generation": "auto",
  "sequential_image_generation_options": { "max_images": 4 },
  "size": "2K"
}
```

| Field | Values | Notes |
|---|---|---|
| `sequential_image_generation` | `"disabled"` (default) \| `"auto"` | `auto` turns on batch |
| `sequential_image_generation_options.max_images` | 1–15, default 15 | Only read when the above is `auto` |

**Hard constraint:** `input reference images + generated images ≤ 15`. So with
3 references the ceiling is 12, not 15.

`max_images` is a *maximum*, not a quantity — the model may return fewer. Cost
must therefore be charged on what came back, not on what was asked for.

Supported models: **Seedream 5.0 lite** (what we run), 4.5, 4.0. Seedream 5.0
pro is not in the supported list.

Works with references too, so "multi-reference image-to-batch-image" is one
call: keep a character consistent across a whole set.

---

## 3D generation (R5) — BLOCKED, no public API documentation, 2026-08-29

Two 3D models exist and are listed in the Model list (1330310) with generous
free quota:

| Model | Capabilities | Output | Free quota |
|---|---|---|---|
| `Hyper3d-Rodin-Gen2` | Text-to-3D, images-to-3D; white / textured / PBR | glb, obj, stl, fbx, usdz; tri mesh 500–1,000,000 | 150K |
| `Hitem3d-2.0` | Images-to-3D; standard and high-precision, white or textured | glb, obj, stl, fbx, usdz; 100,000–2,000,000 polys | 500K |

**But there is no 3D tutorial or API reference in the ModelArk documentation
tree.** Every other capability row in the Model list carries
"Tutorial: … | API: …" links; the 3D row carries none, and the whole docs nav
(80+ entries, enumerated) has no 3D page. The only links are console model-card
URLs, which need a signed-in session.

**Do not guess the endpoint.** This project has already lost time to invented
model IDs and unconfirmed shapes.

**Next action (user):** open the console model card for `hyper3d-gen2` and copy
its API sample — the exact endpoint path, request body, and whether it is
synchronous or a create-then-poll task like video.
