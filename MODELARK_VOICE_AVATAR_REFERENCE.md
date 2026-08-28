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

## Voice (TTS) — request contract confirmed live; response shape still unconfirmed

**Confirmed: a genuinely separate BytePlus product ("Seed Speech", internally "Doubao
Speech Service"), not part of ModelArk's `arkruntime` API surface at all** — separate
console area (`console.byteplus.com/voice/...`), separate per-service activation
(billed by character count, not part of ModelArk billing), and **a separate API key**
from `ARK_API_KEY` (generated under Seed Speech → API Key, not ModelArk → API Keys).

**Confirmed request contract**, from BytePlus's own "Quick API Access" sample code after
activating the Text-to-Speech 2.0 model:

```
POST https://voice.ap-southeast-1.bytepluses.com/api/v3/tts/unidirectional
```

Headers (note: different auth scheme than ModelArk's `Authorization: Bearer`):
```
x-api-key: <Seed Speech API key>
X-Api-Resource-Id: seed-tts-2.0
Connection: keep-alive
Content-Type: application/json
```

Body:
```json
{
  "req_params": {
    "text": "To be or not to be, that is the question.",
    "speaker": "en_female_stokie_uranus_bigtts",
    "additions": "{\"disable_markdown_filter\":true,\"enable_language_detector\":true,\"enable_latex_tn\":true,\"disable_default_bit_rate\":true,\"max_length_to_filter_parenthesis\":0,\"cache_config\":{\"text_type\":1,\"use_cache\":true}}",
    "audio_params": {
      "format": "mp3",
      "sample_rate": 24000
    }
  }
}
```

Notes on the confirmed shape:
- `speaker` is a specific voice ID string (e.g. `en_female_stokie_uranus_bigtts`) — the
  Text-to-Speech playground's "Voice" picker (showed a voice named "Enzo, middle-aged"
  when last viewed) is presumably how you browse/pick these IDs; check **Voice Library**
  in the Seed Speech console section for the full list and their exact ID strings.
- `additions` is unusually a **JSON-encoded string**, not a nested object — the escaping
  in the sample above is exact, not a formatting artifact. Preserve it as a string when
  implementing.
- The model/resource selection happens via the `X-Api-Resource-Id` header
  (`seed-tts-2.0`), not a `model` field in the body — different pattern from ModelArk's
  `/chat/completions` and `/images/generations`, both of which use a `model` body field.
- The path segment `unidirectional` (vs. the "Bi-directional Streaming (WebSocket)" doc
  page seen earlier) confirms this is the plain single-request/single-response REST
  variant, not the WebSocket streaming one — good, matches this project's existing
  synchronous-image / async-task patterns rather than needing new streaming plumbing.

**Not yet confirmed — the sample code only shows the request:**
- The exact response shape (JSON with a URL? JSON with base64 audio? Raw binary
  `audio/mpeg` bytes as the HTTP body?). To confirm: in the Seed Speech → Text-to-Speech
  playground, type text and click play/generate with browser DevTools' Network tab open,
  then inspect the actual response to the `/tts/unidirectional` call — its
  `Content-Type` header and body shape settle this immediately.
- Whether errors follow the same `{"error": {"code", "message"}}` shape ModelArk uses,
  or something else.
- Full list of valid `speaker` IDs and `X-Api-Resource-Id` values beyond the one example
  (`seed-tts-2.0`) — check Voice Library for the speaker list; there may be other
  resource IDs for different quality/language tiers.

**Implementation note:** since this uses different auth (`x-api-key` + a separate key)
and a different base URL/host (`voice.ap-southeast-1.bytepluses.com`, not
`ark.ap-southeast.bytepluses.com`) than ModelArk, this should be its own client —
not bolted onto `packages/modelark-client`. A new `packages/voice-client` (or similar)
mirroring `modelark-client`'s injectable-fetch pattern makes sense once the response
shape above is confirmed.
