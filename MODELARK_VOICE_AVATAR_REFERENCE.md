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

**Response shape — CONFIRMED via real live calls** (curl with a real API key, response
saved and inspected directly, 2026-08-28 — first with a short prompt, then re-confirmed
with a longer prompt that exposed the full shape):

```
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8
```

The body is **NDJSON (newline-delimited JSON)**, not a single JSON value — a short prompt
happens to produce exactly one line, which is why the first test call looked like a plain
`{code, message, data}` object. A longer prompt produced **10 separate lines**: a run of
`{code:0, data:"<base64 chunk>"}` objects to concatenate (8 chunks observed), then a
`{code:0, data:null}` end-of-audio marker, then a final
`{code:20000000, message:"OK", data:null}` completion marker. Each line is independently
valid JSON; splitting on `\n` and parsing line-by-line is required — `JSON.parse()` on the
whole body throws `Unexpected non-whitespace character after JSON`.

```json
{"code":0,"message":"","data":"<base64-encoded MP3 chunk 1>"}
{"code":0,"message":"","data":"<base64-encoded MP3 chunk 2>"}
{"code":0,"message":"","data":null}
{"code":20000000,"message":"OK","data":null}
```

Critical gotchas:
1. **The `Content-Type` header lies** — it says `text/plain`, not `application/json`, even
   though the body is genuinely JSON(-lines). Any implementation that branches on
   `Content-Type` to decide whether to JSON-parse will silently mishandle this
   correctly-working response.
2. **The body may be multiple JSON lines, not one JSON value.** Concatenate the base64
   `data` from every line that has one (each chunk decodes to valid MP3 bytes when
   reassembled in order — verified: starts with the `ID3` tag signature). Lines with
   `data: null` and `code` equal to `0` or `20000000` are benign markers, not errors.
3. A non-zero `code` value outside that confirmed pair (`0`, `20000000`) on a line with no
   `data` indicates a genuine API-level error (with `message` describing it) even though
   the HTTP status is 200.

**Still not confirmed:**
- The exact non-zero error `code` values and what they mean (only `0` and the `20000000`
  completion marker observed so far)
- Full list of valid `speaker` IDs and `X-Api-Resource-Id` values beyond the one example
  (`seed-tts-2.0`) — check Voice Library for the speaker list; there may be other
  resource IDs for different quality/language tiers.
- Whether `tts/create` (Audio generation), `tts/voice_clone` (Voice Replication), and
  `auc/bigmodel/submit`/`query` (Speech-to-Text) share this exact NDJSON/`{code, message,
  data}` shape, or differ — only `tts/unidirectional` has been live-verified so far.

**Implementation note:** since this uses different auth (`x-api-key` + a separate key)
and a different base URL/host (`voice.ap-southeast-1.bytepluses.com`, not
`ark.ap-southeast.bytepluses.com`) than ModelArk, this is its own client,
`packages/voice-client`, mirroring `modelark-client`'s injectable-fetch pattern.

---

## Audio generation (Seed-Audio-1.0) — confirmed request contract

A separate, richer generation endpoint from basic Text-to-Speech — supports emotion/tone/
style direction via natural-language prompt text (not just a flat sentence), 20 languages,
slash-command timestamp control, and audio-reference support. Confirmed via BytePlus's own
sample code after activating the model:

```
POST https://voice.ap-southeast-1.bytepluses.com/api/v3/tts/create
```

Headers:
```
Content-Type: application/json
X-Api-Key: <Seed Speech API key>
```
(no `X-Api-Resource-Id` header here — unlike `tts/unidirectional`, the model is selected
via the `model` field in the body instead)

Body:
```json
{
  "model": "seed-audio-1.0",
  "text_prompt": "Inside a huge football stadium, with the deafening roar of tens of thousands of fans throughout the ...",
  "audio_config": {
    "format": "mp3",
    "sample_rate": 48000,
    "pitch_rate": 0,
    "speech_rate": 0,
    "loudness_rate": 0
  },
  "watermark": {}
}
```

Notes:
- `text_prompt` (not `text`) — this endpoint expects a richer descriptive prompt that can
  include tone/emotion/style direction and slash-command timestamps (per the playground's
  own description), not just the literal sentence to speak.
- The sample's curl command pipes the response through `python3 -m json.tool` (a JSON
  pretty-printer) — strong indirect evidence the response **is JSON**, not raw audio
  bytes, unlike the `tts/unidirectional` endpoint's unconfirmed shape. Exact response
  field names still need a live test call (same as the basic TTS endpoint).
- The curl sample includes `--max-time 300`, suggesting generation can take up to 5
  minutes for longer prompts — worth a generous client-side timeout.

---

## Voice Replication (voice cloning) — confirmed request contract

```
POST https://voice.ap-southeast-1.bytepluses.com/api/v3/tts/voice_clone
```

Headers:
```
Content-Type: application/json
X-Api-Key: <Seed Speech API key>
X-Api-Request-Id: <a fresh UUID per request>
```

Body:
```json
{
  "speaker_id": "your_speaker_id",
  "audio": {
    "data": "<base64-encoded audio file bytes, no newlines>",
    "format": "wav"
  },
  "language": 1,
  "extra_params": {
    "demo_text": "hello, this is a test"
  }
}
```

Notes:
- The reference audio sample is sent **inline as base64** in the request body — no
  separate upload step or URL reference.
- `speaker_id` is presumably a caller-chosen identifier for the new cloned voice (to be
  reused later as the `speaker` value in Text-to-Speech / Audio generation calls) —
  not confirmed whether it must be unique account-wide or can collide/overwrite.
- `language` is a **numeric code** (`1` in the sample), not a string like `en`/`yue-CN`
  seen elsewhere — the mapping of numbers to languages is not yet confirmed; check Voice
  Library or the Completed Integration Guide link in the console for the code table.
- `demo_text` under `extra_params` is optional — generates a sample utterance in the new
  cloned voice so you can verify it immediately.
- **Product/consent consideration, not just a technical one:** voice cloning of a real
  person's voice needs their explicit consent — this project has no consent-capture flow
  designed yet. Flagging this before implementation, not just as an API detail.

---

## Speech-to-Text (ASR) — confirmed request contract, async create-then-poll

Unlike everything else in Seed Speech, this is **async** — submit a job, then poll it by
resending the same request ID, mirroring ModelArk's video generation pattern.

**Submit:**
```
POST https://voice.ap-southeast-1.bytepluses.com/api/v3/auc/bigmodel/submit
```

Headers:
```
Content-Type: application/json
x-api-key: <Seed Speech API key>
X-Api-Resource-Id: volc.seedasr.auc
X-Api-Request-Id: <a fresh UUID per request>
X-Api-Sequence: -1
```

Body:
```json
{
  "user": { "uid": "demo" },
  "audio": {
    "url": "https://.../console_demo_audio.mp3",
    "language": "yue-CN",
    "format": "wav",
    "codec": "raw",
    "rate": 16000,
    "bits": 16,
    "channel": 1
  },
  "request": {
    "model_name": "bigmodel",
    "enable_itn": true,
    "enable_punc": false,
    "enable_ddc": false,
    "enable_speaker_info": false,
    "enable_channel_split": false,
    "show_utterances": true,
    "vad_segment": false,
    "sensitive_words_filter": ""
  }
}
```

**Query** (poll for the result — same endpoint host, no task ID in the body, just resend
the identical `X-Api-Request-Id` from the submit call):
```
POST https://voice.ap-southeast-1.bytepluses.com/api/v3/auc/bigmodel/query
```

Headers: identical to submit (same `X-Api-Request-Id`, same `X-Api-Resource-Id`)
Body: `{}` (empty — the request ID alone identifies which job to check)

Notes:
- Audio is referenced by **URL**, not inline base64 (opposite of Voice Replication) —
  matches ModelArk's own pattern of referencing media by URL for generation inputs, so
  a private TOS-signed URL should work the same way it does elsewhere in this project.
- `language: "yue-CN"` in the sample is Cantonese — confirms multi-language/dialect
  support; exact list of supported language codes not yet confirmed.
- Not yet confirmed: the submit response shape (does it echo the request ID back, or
  is that solely tracked client-side?), the query response shape (transcript text
  location, confidence scores, timestamps per `show_utterances: true`), and the job
  status values while still processing vs. complete.
