# ModelArk Voice & Avatar Reference — research findings (not yet implemented)

**Status: research only, per ARCHITECTURE.md's rule not to build against guessed endpoints.**
Confidence is genuinely different between the two features below — read the caveats, don't
treat either as equivalent to the confirmed image/video/chat contracts in
`MODELARK_API_REFERENCE.md`.

**Source of truth used:** the same Go SDK as the rest of this project —
`github.com/byteplus-sdk/byteplus-go-sdk-v2`, package `service/arkruntime/model`
(https://pkg.go.dev/github.com/byteplus-sdk/byteplus-go-sdk-v2/service/arkruntime/model),
plus the SDK's `service/` directory listing on GitHub, plus BytePlus's public OmniHuman
product page (byteplus.com/en/product/OmniHuman).

---

## Avatar (OmniHuman) — moderate confidence, worth prototyping against

**Strong evidence this reuses the existing video-generation endpoint, not a separate API.**

`CreateContentGenerationTaskRequest` (the exact same Go type used for video generation,
in `MODELARK_API_REFERENCE.md`) now includes a field not documented there:

```go
OmniReferenceTaskType *string
```

This strongly suggests Avatar generation is **the same `/contents/generations/tasks`
endpoint** (async create-then-poll, same task status enum: `succeeded | cancelled |
failed | running | queued`), just with:
- `omni_reference_task_type` set to select OmniHuman mode (exact string value **not
  confirmed** — likely something like `"omnihuman"`, but this is a guess, not a finding)
- The existing `content` array carrying an `image_url` item (the reference face/portrait)
  and an `audio_url` item (the driving speech track) — both content item types already
  exist in the confirmed video contract, so no new content-item shape is needed
- The response would come back through the same `GetContentGenerationTaskResponse`
  shape, with the resulting video likely in `content.video_url` as usual

**What's confirmed from BytePlus's public OmniHuman product page** (not SDK-verified,
marketing copy):
- Inputs: one reference image + one audio file, with an optional text prompt for refinement
- Output: native 1080p video
- Pricing: **$0.12 per second** of generated video
- Current version: OmniHuman 1.5 (OmniHuman 1.0 exists as an earlier version — model ID
  will presumably carry a version suffix, same pattern as Seedream/Seedance)

**Not confirmed — must verify before writing code:**
- The exact `omni_reference_task_type` string value
- Whether an OmniHuman-specific model ID needs to go in `model` (e.g. an `omnihuman-1-5-*`
  string), separate from the video model already in use
- Whether this needs a *reference* image/audio uploaded first (a separate upload step)
  or accepts a URL directly the same way video generation does
- The BytePlus product page explicitly does not mention ModelArk by name — the Go SDK
  field is the only concrete evidence of ModelArk integration. **Before writing any code,
  check Console → ModelArk → Model Square for an OmniHuman model card** (same way the
  chat model `dola-seed-2-1-turbo-260628` was confirmed) — if it's not listed there, this
  may need direct BytePlus sales/support contact rather than being self-serve via API key.

---

## Voice (TTS) — low confidence, do not build against this yet

**This is very likely a separate BytePlus product ("BytePlus Voice" / "Seed Speech"),
not part of ModelArk's `arkruntime` API surface at all.**

Evidence:
- BytePlus's docs site has an entirely separate section at
  `docs.byteplus.com/en/docs/byteplusvoice/*` (not under any ModelArk path), covering
  "TTS 2.0", "TTS - Bi-directional Streaming (WebSocket)", and "ASR-Audio File" as
  distinct pages — the WebSocket streaming page in particular suggests a different
  transport/protocol than ModelArk's plain REST `/chat/completions`-style API.
- The Go SDK's `arkruntime/model` package (155+ exported types, full list checked) has
  **no TTS-specific request/response types at all**. The only audio-related type,
  `AudioUrl { Url string }`, is a generic content-item shape already used for supplying
  audio as an *input* to video generation — it is not a text-to-speech output type.
- The SDK's top-level `service/` directory (same repo, same source of truth as
  everything else in this project) has **no separate voice/TTS/speech service package**
  either — so if BytePlus Voice has its own Go SDK coverage, it is not in this repo.

**Could not confirm via automated fetch:** `docs.byteplus.com` is a JS single-page app
(the exact problem `MODELARK_API_REFERENCE.md` already flagged for image/video docs) —
every automated attempt to read the actual API Reference page returned only navigation
chrome, no real endpoint/field content, even via an AI-summarizing fetch tool.

**What this means for implementation:** Voice generation likely needs:
1. A completely different base URL (not `ark.ap-southeast.bytepluses.com/api/v3`)
2. Possibly different authentication (the "Bi-directional Streaming (WebSocket)" doc page
   name suggests this might not even be a simple bearer-token REST call)
3. Confirming whether "BytePlus Voice" is enabled on this account at all — **check the
   BytePlus Console's service list (or search "Voice" in the console search bar) before
   assuming this is available**; it may require separate activation like TOS was.

**Recommended next step, in order:**
1. Check the BytePlus Console for a "Voice" or "Seed Speech" service listing — confirm
   it's activated and see if its own console area shows an API/Access tab with example
   code (same pattern that worked for confirming the image/video/chat model IDs)
2. If found, the exact endpoint/field names still need field-level verification the same
   rigor as `MODELARK_API_REFERENCE.md` before any client code gets written
3. If BytePlus Voice does need a genuinely different SDK client (different base URL/auth
   scheme than `packages/modelark-client`), it should likely be its own package rather
   than bolted onto the existing ModelArk client
