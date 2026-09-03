# Deploying Creative AI for real

Written 2026-09-03. This is the runbook for putting the platform on the open
internet so the studio can use it around the clock — not a demo tunnel, not a
laptop left running.

**Read Section 0 before spending anything.** One line of configuration in there
protects the ModelArk bill, and one outstanding chore protects it from
strangers.

---

## 0. Before you buy anything

### 0.1 The two keys in the screenshots must be rotated first

`ARK_API_KEY` and `BYTEPLUS_VOICE_API_KEY` have appeared in shared screenshots.
They bill real money and anyone holding them can spend it. Rotate both in the
BytePlus console **before** they go onto a server that is reachable from the
internet. This has been outstanding for several sessions; deployment is the
point where it stops being theoretical.

### 0.2 The door is now closed by default

Until today, anyone who reached the sign-in page with a Google account could
create an account, receive a welcome grant, and spend the studio's ModelArk
money. On a laptop that did not matter. On a public URL it is the whole
problem.

`ALLOWED_SIGN_IN` now decides who may sign in:

```
ALLOWED_SIGN_IN=@yourcompany.com,naveen@gmail.com
```

An entry starting with `@` admits a whole email domain; anything else admits
exactly that address. **In production an empty value admits nobody.** If nobody
can sign in after deployment, check this first — that failure is deliberate,
because the alternative failure is a stranger's video on your invoice.

### 0.3 What this costs, honestly

| | Monthly |
|---|---|
| Server (4 vCPU / 8 GB / 160 GB SSD, Singapore) | ~$24–48 |
| Domain | ~$1 |
| Object storage (TOS) | usage-based; small next to generation |
| **Fixed total** | **~$25–50 per month** |
| BytePlus generation | **the real cost** — a 30s 1080p film is ~779 credits, roughly $31 |

The server is the small number. Generation is the bill. Decide the credit
policy per person before the studio starts using it, because the platform will
happily spend whatever ModelArk allows.

### 0.4 Which server

Use **one machine running everything in Docker**. Not because it is clever, but
because it is one login, one bill, one place to look when something breaks, and
it survives a reboot on its own.

Pick the region closest to the TOS bucket — `ap-southeast-1`, Singapore. The
worker moves hundreds of megabytes per film between the server and TOS; putting
them in different regions makes every job slower and adds transfer charges.

Two reasonable choices:

- **BytePlus ECS, ap-southeast-1** — same vendor, same bill, same region as the
  bucket, and no new procurement to get approved. Preferred, because the
  company already has BytePlus billing set up.
- **DigitalOcean, Singapore** — better documentation for a first-time operator,
  separate bill. Use this if BytePlus ECS turns into a procurement conversation.

Minimum sizing: **4 vCPU, 8 GB RAM, 160 GB disk.** ffmpeg stitching a sixteen-
clip chain is the memory and disk peak; 2 GB will fail on long films.

---

## 1. What only you can do

None of this can be done from a code editor. It needs your accounts, your
company's DNS, and your card.

1. **Rotate the two API keys** (Section 0.1).
2. **Buy the server** — 4 vCPU / 8 GB / 160 GB, Singapore, Ubuntu 24.04 LTS.
3. **Get a domain or subdomain** — ask IT for something like
   `studio.yourcompany.com`, and have them point its **A record** at the
   server's IP address. Certificates cannot be issued until this is true.
4. **Create Google OAuth credentials** at
   `console.cloud.google.com` → APIs & Services → Credentials, with the
   authorised redirect URI
   `https://studio.yourcompany.com/api/auth/callback/google`.
5. **Decide who is allowed in** — the value of `ALLOWED_SIGN_IN`.
6. **Decide the credit policy** — `INITIAL_CREDITS` per new account, and who
   may top up.

If the company does not use Google Workspace, you also need a Resend account
with your sending domain verified, which means DNS records IT must add. Google
sign-in avoids this entirely; prefer it.

---

## 2. Deploying, step by step

Every command below runs **on the server**, over SSH, as a user with `sudo`.

### 2.1 Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
```

```bash
sudo usermod -aG docker $USER && newgrp docker
```

### 2.2 Get the code

```bash
sudo mkdir -p /opt/creative-ai && sudo chown $USER /opt/creative-ai
```

```bash
git clone https://github.com/QuantumWeaveDev26/Custom-interface.git /opt/creative-ai
```

```bash
cd /opt/creative-ai
```

### 2.3 Write the configuration

```bash
cp infra/.env.production.example infra/.env.production && chmod 600 infra/.env.production
```

Generate a session secret and keep the output:

```bash
openssl rand -base64 32
```

Then edit the file and fill in every blank. The ones that must not be skipped:
`SITE_DOMAIN`, `NEXTAUTH_URL`, `AUTH_URL`, `NEXTAUTH_SECRET`,
`ALLOWED_SIGN_IN`, `POSTGRES_PASSWORD` (**and the same password inside
`DATABASE_URL`**), `ARK_API_KEY`, the four `TOS_*` values, and the Google
client id and secret.

```bash
nano infra/.env.production
```

### 2.4 Start everything

```bash
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.production up -d --build
```

The first build takes roughly ten minutes. It compiles the whole monorepo
inside the image, runs the database migrations once, then starts the web app,
the worker, and Caddy — which fetches the HTTPS certificate by itself.

Watch it come up:

```bash
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.production ps
```

### 2.5 Check it is actually serving

```bash
curl -fsS https://studio.yourcompany.com/api/health
```

`{"ok":true}` means the web app can reach both the database and the queue.
Anything else, read the logs:

```bash
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.production logs --tail=100 web worker
```

### 2.6 Prove the door is locked

This is the one test worth doing by hand, because getting it wrong is expensive
and silent. Sign in with an address that is **not** in `ALLOWED_SIGN_IN` and
confirm you are refused. Then sign in with one that is, and confirm you get in.

### 2.7 Turn on nightly backups

```bash
chmod +x infra/backup.sh
```

```bash
sudo crontab -e
```

Add this line:

```
0 3 * * * /opt/creative-ai/infra/backup.sh >> /var/log/creative-ai-backup.log 2>&1
```

A backup is not real until a restore has been tried once. The restore command
is in the header of `infra/backup.sh`; run it against a scratch database before
you rely on it.

---

## 3. Running it day to day

Shortened below — every command starts with
`docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.production`.

| Task | Command tail |
|---|---|
| See what is running | `ps` |
| Follow the worker | `logs -f worker` |
| Deploy new code | `git pull` then `up -d --build` |
| Restart one service | `restart web` |
| Stop everything | `down` (data survives — it lives in named volumes) |

Everything restarts by itself after a crash or a reboot, because Docker starts
at boot and every service is marked `unless-stopped`. That is what makes this a
24-hour deployment rather than a laptop.

---

## 4. What is not done

Stated plainly, because a runbook that hides its gaps is worse than none.

- **The Docker images have never been built.** There is no Docker on the
  Windows development machine, so `infra/Dockerfile` is written from the
  project's known build steps but has not been executed anywhere. Expect the
  first `up -d --build` to need one or two corrections; the likely places are
  the pnpm install layer and the Prisma engine.
- **The allowlist is unit-tested, not live-tested.** Nine tests cover the rule
  itself. That NextAuth refuses a sign-in when the rule returns false is
  library behaviour not yet observed on a running site — hence step 2.6.
- **No monitoring.** Nothing pages anyone when the site goes down. Point a free
  uptime checker at `/api/health` once the domain is live.
- **One machine, no redundancy.** If it dies, the site is down until it is
  rebuilt. Acceptable for an internal studio tool, but say so out loud rather
  than discovering it during an outage.
- **No log rotation** configured beyond Docker's defaults. Check disk usage
  after the first month.
