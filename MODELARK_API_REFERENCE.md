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
