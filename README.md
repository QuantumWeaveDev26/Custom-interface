# Creative AI - Phase 1 Monorepo

A Next.js + Node.js monorepo for building authenticated AI generation workflows with credit-based transactions.

## Local Setup

### Prerequisites

- Node.js >= 20.19
- pnpm 11.19.0
- PostgreSQL 16
- Redis 7
- Valid API keys for: ModelArk, Resend, Google OAuth, BytePlus TOS

### Environment Configuration

1. Copy environment template:
```bash
cp .env.example .env.local
```

2. Fill in required values:
- `ARK_API_KEY`: ModelArk API key
- `ARK_BASE_URL`: ModelArk endpoint (default: `https://ark.ap-southeast.bytepluses.com/api/v3`)
- `MODELARK_IMAGE_MODEL`: Image model ID (default: `seedream-5-0-lite-260128`)
- `MODELARK_VIDEO_MODEL`: Video model ID (default: `dreamina-seedance-2-0-fast-260128`)
- `DATABASE_URL`: PostgreSQL connection
- `REDIS_URL`: Redis connection
- `TOS_ACCESS_KEY`, `TOS_SECRET_KEY`, `TOS_BUCKET`, `TOS_REGION`, `TOS_ENDPOINT`: BytePlus TOS config
- `AUTH_RESEND_KEY`: Resend email service API key
- `AUTH_EMAIL_FROM`: Sender email for magic links
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: Google OAuth credentials
- `NEXTAUTH_SECRET`: Random string for Auth.js (generate: `openssl rand -base64 32`)

### Database Setup

```bash
pnpm db:generate   # Generate Prisma client
pnpm db:validate   # Validate schema
```

Create PostgreSQL database:
```sql
CREATE DATABASE custom_interface;
```

Run migrations (using Prisma):
```bash
cd packages/db
npx prisma migrate deploy
```

### Development

Start local services:
```bash
docker-compose up -d  # Starts PostgreSQL and Redis
```

Run dev servers (two terminals — the worker has no watch/dev mode, so rebuild
it after each change):
```bash
pnpm --filter @creative-ai/web dev                                     # Next.js on :3000
pnpm --filter @creative-ai/worker build && pnpm --filter @creative-ai/worker start  # BullMQ consumer

pnpm test           # Run all tests
pnpm typecheck      # Type validation
pnpm build          # Production build
```

Access:
- **Web UI**: http://localhost:3000
- **Sign-in**: http://localhost:3000/sign-in (magic link or Google OAuth)
- **Studio**: http://localhost:3000/studio (after auth)
- **Gallery**: http://localhost:3000/gallery (after auth)

## Architecture

### apps/web
Next.js 15 frontend + API routes:
- Auth.js v5 integration (Resend + Google OAuth)
- `/api/jobs` - Job submission with credit transactions
- `/api/jobs/:id/stream` - Server-sent events for job status
- `/api/assets/:id` - Private asset access (signed TOS URLs)
- `/studio` - Prompt submission with live SSE status and result rendering
- `/gallery` - Private grid of the signed-in user's generated assets

### apps/worker
Standalone Node.js BullMQ consumer:
- Processes queued generation jobs
- Calls ModelArk image/video APIs
- Uploads outputs to BytePlus TOS
- Publishes job events via Redis pub/sub
- Periodic recovery sweep for crash-window orphans

### packages/db
Prisma + database operations:
- Auth.js adapter models (User, Account, Session, VerificationToken)
- Job, Asset, CreditLedgerEntry models
- Transactional job submission with credit guards
- Welcome grant integration

### packages/modelark-client
Typed ModelArk HTTP client:
- Image generation (POST /images/generations)
- Video task creation & polling (POST/GET /contents/generations/tasks)
- Error handling with safe user messages

### packages/shared-types
Shared TypeScript contracts:
- Job submission & status event schemas
- BullMQ queue configuration
- Validation utilities

## Testing

```bash
pnpm test           # Run all test suites
pnpm typecheck      # Full repo type checking
```

Phase 1 tests cover:
- Job submission transactions
- Credit deduction & compensation
- TOS storage operations
- Job status messaging
- Recovery sweep logic
- Generation processor state machine

## Constraints

**Stack (locked for Phase 1)**:
- Next.js 15, React 19, TypeScript 5.9.3
- Prisma 6.19.3, Auth.js 5.0.0-beta.32
- BullMQ 6.3.1, ioredis 6.0.0
- Tailwind 4.3.3

**Models (fixed)**:
- Image: `seedream-5-0-lite-260128`, cost: 1 credit, 4K PNG output
- Video: `dreamina-seedance-2-0-fast-260128`, cost: 14 credits, 5s 720p 21:9 output

**User data**:
- `User.email` required (non-nullable)
- Welcome grant: 100 credits (configurable)
- Max in-flight jobs per user: 3 (configurable)

**Retry policy**:
- BullMQ: `attempts: 1` (no retries on generation failure)
- Database: Serializable isolation for conflict retries
- Recovery sweep: 30-second interval, 60-second stale threshold

## Git Workflow

Each task is a single commit:
1. Task 1: Monorepo scaffold
2. Task 2: Phase 1 contracts  
3. Task 3: ModelArk client
4. Task 4: Auth.js adapter & User welcome grant
5. Task 5: Job submission & credit lifecycle
6. Task 6: TOS storage, recovery, & worker runtime
7. Task 7: Magic-link + Google authentication
8. Task 8: Transactional job submission API
9. Task 9: Job SSE + private asset access
10. Task 10: Studio & gallery UI
11. Task 11: README & verification

Verify with:
```bash
git log --oneline | head -11  # See task commits
pnpm test && pnpm typecheck && pnpm build  # Full validation
```

## Phase 2+ Features (Out of Scope)

- Prompt library & versioning
- Agent orchestration
- Director workflow
- Voice/avatar generation
- Billing & subscription
- Admin dashboard
- Public gallery
- ECS deployment
- Chat interface
- Advanced generation settings
