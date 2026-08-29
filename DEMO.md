# Showing this to someone (public URL)

How to put the running app behind a public HTTPS link — for a demo, not for
production. Nothing is deployed anywhere; this tunnels to your own machine.

For the real deployment path see `BUILD_PLAN.md` § F4.

---

## Before you share the link

- **Rotate `ARK_API_KEY` and `BYTEPLUS_VOICE_API_KEY` first.** They appeared in
  plaintext in shared screenshots. Publishing the app while leaked keys are live
  is the worst possible timing — they bill real spend.
- **Every new signup is granted 100 free credits**, and there is no
  signup-abuse guard (`ARCHITECTURE.md` § 8). A public link that leaks is
  strangers spending your BytePlus balance. Share it narrowly, and turn the
  tunnel off when the demo is over.
- **Anyone who generates spends your credits**, not theirs.

---

## Steps

### 1. Install cloudflared (once)

```bash
winget install --id Cloudflare.cloudflared
```

### 2. Start PostgreSQL

It is **not** a Windows service on this machine — nothing starts it at boot.
Redis (Memurai) *is* a service and starts on its own, so "Redis is up" is not
evidence that Postgres is.

```bash
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "C:/Program Files/PostgreSQL/18/data" -l "C:/Program Files/PostgreSQL/18/data/startup.log" start
```

### 3. Start the tunnel — before the app

You need the public URL before the app boots, because the app has to be
configured with it.

```bash
cloudflared tunnel --url http://localhost:3000
```

It prints a URL like `https://random-words-here.trycloudflare.com`. Copy it.

### 4. Point the app at that URL

In `apps/web/.env`:

```text
NEXTAUTH_URL=https://random-words-here.trycloudflare.com
```

**This is not optional.** Left as `localhost:3000`, sign-in redirects your
visitor back to *their own* machine and they get a blank page. The failure looks
like a broken app rather than a misconfiguration, which is why it is worth
getting right the first time.

### 5. Add the Google OAuth callback

Google Cloud Console → Credentials → your OAuth client → Authorized redirect
URIs, add:

```text
https://random-words-here.trycloudflare.com/api/auth/callback/google
```

Skip this and Google sign-in fails; the email magic link still works.

### 6. Start the worker and the web app

```bash
npx pnpm --filter @creative-ai/worker build && npx pnpm --filter @creative-ai/worker start
```

```bash
npx pnpm --filter @creative-ai/web dev
```

Send the tunnel URL.

---

## What will bite you

| Thing | Why |
|---|---|
| URL changes on every `cloudflared` restart | Redo steps 4 and 5 each time |
| Your PC sleeping or shutting down | Link dies — it points at your machine |
| Running `pnpm build` while `next dev` is running | Both write `apps/web/.next`; the app serves with no CSS and unrelated pages 404. Stop dev, delete `apps/web/.next`, restart |
| Worker rebuilt but not restarted | It keeps serving old code silently. Rebuild **and** restart |

---

## What to actually show

Verified working end to end:

- **Studio → Image** — text to image, multi-reference character consistency
- **Studio → Video** — text to video, animate an image, first/last keyframes,
  extend or edit an existing clip
- **Studio → Voice** — standard and expressive text to speech
- **Director** — a brief becomes a multi-shot plan, then video
- **Marketing** — a product URL becomes an ad
- **Transcribe** — speech to text
- **Gallery** — everything generated

Built and passing tests but **not yet clicked through in a browser** — demo
these only after trying them yourself first:

- Saved named characters (Image tab)
- Cinema presets — camera move / lens / look
- Batch image generation — the "How many" slider
- Semantic search in the Gallery (press **Index up to 20** before searching, or
  it returns nothing — which is expected, not a bug)

Known blocked, do not demo:

- **Voice cloning** — fails upstream at the BytePlus gateway, not our code
- **3D generation** — contract confirmed, not built yet
- **Talking avatar / lipsync** — BytePlus rejects input images containing a real
  face

---

## Turning it off

Close the `cloudflared` terminal. The link dies immediately.
