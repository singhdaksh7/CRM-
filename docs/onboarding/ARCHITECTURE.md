# Architecture

Everything here was checked against the code. Paths are relative to the repository root.

## Runtime view

```mermaid
flowchart TB
  subgraph Client
    BR[Browser / installed PWA]
  end
  subgraph App["Next.js 16 app (one process)"]
    PX[src/proxy.ts<br/>auth gate + role redirects]
    PG[Server-rendered pages<br/>src/app/(app)/**]
    API[Route handlers<br/>src/app/api/**/route.ts]
    LIB[Domain logic<br/>src/lib/**]
    INT[Provider adapters<br/>src/integrations/**]
  end
  DB[(PostgreSQL<br/>Prisma 6)]
  RD[(Redis<br/>optional)]
  OBJ[(R2 / S3 storage)]
  WA[Meta WhatsApp Cloud API]
  MAP[Google Maps APIs]
  PORT[99acres / Housing / other portals]

  BR --> PX --> PG
  BR --> PX --> API
  PG --> LIB
  API --> LIB
  LIB --> DB
  LIB -.-> RD
  LIB --> INT
  INT --> OBJ
  INT --> WA
  INT --> MAP
  PORT -- webhook POST --> API
```

Request path, in words:

1. **Browser → Next.js.** Every request goes through `src/proxy.ts` (Next 16's name for middleware). It lets a fixed allow-list of public paths through (`/login`, `/p/*`, `/share/catalogue/*`, `/api/catalogues/*`, `/api/integrations/*`, `/api/auth/*`, health endpoints, PWA assets, the cron sweep). Everyone else needs a session, otherwise they are redirected to `/login`. For page routes it also applies the role check `canAccess(role, pathname)`. API routes are *not* role-checked here; each handler does it itself.
2. **Pages / route handlers → domain logic.** Server components and route handlers call functions in `src/lib/`. Route handlers start with `requireSession(allowedRoles?)` from `src/lib/api-auth.ts`, resolve the tenant with `getOrganizationId(session.user)`, validate input with Zod, call a lib function, and return JSON. Errors go through `handleApiError()` (known errors → their status; unknown → logged with a `requestId`, opaque 500).
3. **Domain logic → Prisma → PostgreSQL.** One shared client in `src/lib/prisma.ts`. Prisma needs `DATABASE_URL` and `DIRECT_URL` (equal locally).
4. **Next.js → Redis (optional).** `ioredis` is used in `src/lib/rate-limit.ts` (login and webhook limits), `src/lib/cache.ts` (short-lived read-through cache for dashboards/reports), `src/lib/maps-cache.ts`, and a sweep lock in `src/lib/notifications.ts`. Redis holds **no business data**. Every use fails open: with `REDIS_URL` unset, limits are no-ops and caches are bypassed.
5. **External integrations.** Outbound: WhatsApp (`src/integrations/whatsapp`), maps (`src/integrations/maps`), object storage (`src/lib/storage-providers`). Inbound: webhooks under `src/app/api/integrations/*`. All of them default to a disabled/mock mode locally.

## Directory structure

```
.
├── src/
│   ├── app/                 Next.js App Router
│   │   ├── (app)/           Authenticated UI (route group; shared layout + sidebar)
│   │   ├── api/             Route handlers (JSON APIs, webhooks, health, cron sweep)
│   │   ├── login, forgot-password, reset-password, setup-account/   Auth pages
│   │   ├── p/[id]           Public property page (no login)
│   │   └── share/catalogue/[token]   Public catalogue page (no login)
│   ├── components/          React components grouped by feature (leads, properties, visits, ...)
│   ├── lib/                 Domain logic, queries, validators, helpers (the bulk of the code)
│   ├── integrations/        Provider adapters: whatsapp, maps, ninety-nine-acres, housing, property-portals
│   ├── proxy.ts             Auth + role gate (Next 16 "proxy", formerly middleware)
│   ├── instrumentation.ts   Runs env validation (src/lib/env.ts) at startup
│   └── test/                Test stubs (e.g. server-only)
├── prisma/
│   ├── schema.prisma        The data model (PostgreSQL)
│   ├── migrations/          Tracked migrations (36) - the only ones `migrate deploy` applies
│   ├── seed.ts              Legacy local demo seed (`npm run db:seed`)
│   ├── manual-migrations/   Historical hand-run SQL kept for the record (NOT applied by Prisma)
│   ├── ci/ , audit/         CI bootstrap SQL and read-only audit SQL
│   └── migrations.sqlite-archive/   Pre-PostgreSQL history, archival only
├── scripts/                 tsx scripts: demo seed/verify/remove, admin bootstrap, handover reset
├── tests/e2e/               Playwright specs, fixtures, QA seeds, safety guard
├── deploy/                  Production runbook + shell scripts for the VPS (read-only reference for you)
├── docs/                    Integration docs + this onboarding folder
├── Dockerfile, docker-compose.yml (local infra), docker-compose.prod.yml (production)
└── public/                  Static assets, PWA service worker
```

Unit tests are **co-located** with the code as `*.test.ts` (283 files); Vitest picks up `src/**/*.test.ts` and `scripts/**/*.test.ts`.

## Where business logic belongs

| Put it in… | What goes there | Example |
|---|---|---|
| `src/lib/*.ts` | Domain rules and DB access. Should be callable from both a page and a route handler and unit-testable. | `visits.ts`, `matching.ts`, `scoring.ts`, `assignment.ts` |
| `src/app/api/**/route.ts` | Thin HTTP layer: auth, tenant, Zod parse, call lib, shape the response. | `api/leads/[id]/completed-visit/route.ts` |
| `src/app/(app)/**/page.tsx` | Server-side data loading for a screen, using lib query helpers; passes plain props down. | `(app)/visits/page.tsx` |
| `src/components/**` | Presentation and client interactivity. No direct DB access. | `components/leads/lead-workspace.tsx` |
| `src/integrations/**` | Anything that talks to (or is called by) an external vendor, behind a provider interface. | `integrations/whatsapp/whatsapp-service.ts` |
| `src/lib/validators.ts` | Shared Zod schemas for request bodies and enums mirrored from Prisma. | lead/property/visit schemas |
| `prisma/schema.prisma` + a migration | Any persistent shape change. | see [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md) |

Rule of thumb: **if a rule must hold no matter which screen triggers it, it lives in `src/lib` and the API enforces it** — the UI only reflects it. (Example: "Visit Completed needs a visit" is enforced by `PATCH /api/leads/[id]`; the dialog is just how the UI recovers.)

## Important shared helpers

| Helper | File | Purpose |
|---|---|---|
| `requireSession(roles?)`, `handleApiError`, `ApiError` | `src/lib/api-auth.ts` | Session + role check and uniform error responses for route handlers |
| `getOrganizationId(user)` | `src/lib/organization.ts` | Fail-closed tenant resolution from the session. Never from client input |
| `NAV_ITEMS`, `canAccess`, `isRestrictedToOwnRecords` | `src/lib/permissions.ts` | Page-level role map used by `proxy.ts` and the sidebar |
| `isLeadAccessibleToUser`, lead scope filters | `src/lib/lead-access.ts` | Field-executive lead visibility, one definition |
| `fieldExecutiveHasPropertyAccess` | `src/lib/property-access.ts` | Whether a field executive may see a property's internal detail |
| `logActivity` / `recordAudit` | `src/lib/activity.ts`, `src/lib/audit.ts` | Lead timeline and audit trail writers (audit redacts sensitive keys) |
| `validateEnv` | `src/lib/env.ts` | Fail-fast environment validation (Zod) at startup |
| `checkRateLimit`, `clientIp` | `src/lib/rate-limit.ts` | Redis fixed-window limiter (fails open) |
| `residentialConfigurationLabel`, `propertySpecSummary` | `src/lib/property-categories.ts` | The only correct way to render BHK / 1 RK / commercial spec text |
| `parsePropertyBhkFilter`, `resolvePropertyListBhkFilter` | `src/lib/property-list-filters.ts` | BHK filter parsing that keeps `0` (1 RK) |
| `scheduleVisit`, `completeVisit`, `logCompletedVisitForLead` | `src/lib/visits.ts` | Visit state machine |
| `matchPropertiesToLead` | `src/lib/matching.ts` | Scoring engine; `lead-matching.ts`, `lead-requirement-matching.ts`, `property-rematch.ts` orchestrate it |
| `recalculateLeadScore` | `src/lib/scoring.ts` | 0–100 lead score → Hot/Warm/Cold |
| `selectEmployeeForLead`, `autoAssignLead` | `src/lib/assignment.ts` | Assignment strategies |
| `getWhatsAppProvider` & providers | `src/integrations/whatsapp/` | Provider-agnostic WhatsApp layer |
| `toPublicCatalogueDTO` | `src/lib/catalogue-dto.ts` | Whitelist DTO for public pages: never serialize a Prisma row publicly |
| `logger`, `captureException` | `src/lib/logger.ts`, `src/lib/monitoring.ts` | Structured logs with redaction; Sentry |

## Cross-cutting conventions

- **Tenant scoping on every query.** Every read/write filters by `organizationId`. Dedicated `*-org-isolation.test.ts` files guard this.
- **Server-only modules.** Many files import `server-only`; Vitest aliases it to a stub (`vitest.config.ts`).
- **Webpack, not Turbopack.** `npm run dev` / `build` use `--webpack`; the repo documents Turbopack hanging in the original environment. Keep the flag unless you have a reason.
- **Standalone build.** `next.config.ts` sets `output: "standalone"` for the Docker image. The CSP is built at **build time** (`src/lib/csp.ts`), so some env values are baked into the image — see [DEPLOYMENT_OVERVIEW.md](DEPLOYMENT_OVERVIEW.md).
- **Background work.** There is no job queue. The only scheduled work is the notification sweep (`GET` or `POST /api/internal/notifications/sweep`, bearer `CRON_SECRET`), triggered by host cron in production (and declared in `vercel.json` for the legacy Vercel setup). It only creates in-app notifications.
- **Public surface is minimal and DTO-shaped.** `/p/[id]`, `/share/catalogue/[token]`, and `/api/catalogues/public/[token]/*` never expose owner name/phone/notes or internal fields.

Next: [MAC_SETUP.md](MAC_SETUP.md).
