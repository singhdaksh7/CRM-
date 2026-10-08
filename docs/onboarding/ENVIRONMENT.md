# Environment Variables

No real secret values appear in this document or anywhere in the repo. The authoritative list is the Zod schema in `src/lib/env.ts` (validated at startup via `src/instrumentation.ts`; the app refuses to start on a bad config) plus the `process.env.*` reads in `src/`.

## The three environments

| | LOCAL | QA | PRODUCTION |
|---|---|---|---|
| Purpose | day-to-day development | Playwright browser tests | the live CRM |
| File | `.env` (copied from `.env.example`) | `.env.qa` (gitignored; you create it) | `/opt/kp-crm/env/.env.production` **on the server only** |
| Database | Docker Postgres `delhi_broker_crm` on `localhost:5434` | separate disposable DB, e.g. `delhi_broker_crm_qa`, same Postgres | Postgres 17 container on the VPS |
| Data | fake demo data (`npm run seed:demo`) | synthetic QA identities | **real customer data** |
| App URL | `http://localhost:3000` | `http://localhost:3100` | `https://crm.kpproperties.co.in` |
| Integrations | `MOCK` / `DISABLED` | forced `MOCK` / `DISABLED` | real R2, optional WhatsApp, 99acres secret |

**Production secrets must never be copied to a developer machine casually.** You do not need them to develop anything in this repository. If you believe you do, ask the owner and use a tightly scoped, time-limited, audited path instead of pasting a file. The repo contains only `.env.example` (local placeholders) and `.env.production.template` (placeholders describing the server file).

`.gitignore` ignores every `.env*` except `.env.example` and `.env.production.template`. Never use `git add -f` on an env file.

> Use `.env`, not `.env.local`: the Prisma CLI and the `tsx` scripts do not read `.env.local`.

## Core (required)

| Variable | Req. | What it does | Safe local value | Prod-only? | Can mock/disable? |
|---|---|---|---|---|---|
| `DATABASE_URL` | yes | Runtime Prisma connection | `postgresql://crm:crm_dev_password@localhost:5434/delhi_broker_crm?schema=public` | prod value is different and secret | n/a, local Postgres is Docker |
| `DIRECT_URL` | yes (schema declares it) | Prisma migrations/introspection. Same as `DATABASE_URL` locally | same as above | prod differs | n/a |
| `AUTH_SECRET` | yes, ≥16 chars | Signs Auth.js JWT sessions | any local string, e.g. output of `openssl rand -base64 32` | prod uses a different secret; rotating it logs everyone out | n/a |
| `NEXTAUTH_URL` | yes, valid URL | Canonical app URL. Must be `https://` when `NODE_ENV=production` | `http://localhost:3000` | prod: the https domain | n/a |
| `NEXT_PUBLIC_APP_URL` | yes, valid URL | Public origin used to build catalogue and property links. **Inlined at build time** | `http://localhost:3000` | prod: the https domain | n/a |
| `AUTH_TRUST_HOST` | behind a proxy | Lets Auth.js trust the forwarded host | not needed for `npm run dev`; QA sets `true` | prod (behind Traefik) | n/a |
| `AUTH_URL` | prod template only | Mirrors `NEXTAUTH_URL` in the production template | leave unset | prod | n/a |

## Redis

| Variable | Req. | Notes |
|---|---|---|
| `REDIS_URL` | optional | Local: leave it **unset** (commented in `.env.example`) unless you are working on Redis-backed code; to enable use `redis://localhost:6380`. Used for rate limiting, caches and the sweep lock. **Unset ⇒ rate limits are no-ops and caches bypassed; app still works.** Prod: password-protected Redis on the internal Docker network. |
| `RATE_LIMIT_<NAME>_MAX` / `_WINDOW_SECONDS` | optional | Per-endpoint limiter overrides (login, webhooks, uploads, maps, WhatsApp, password reset…). Defaults are in `src/lib/rate-limit.ts`. Do not set locally. |
| `DASHBOARD_QUERY_CONCURRENCY` | optional | Caps concurrent dashboard queries per request. |

## WhatsApp

| Variable | Req. | Notes |
|---|---|---|
| `WHATSAPP_PROVIDER` | default `MOCK` | `MOCK` (no network, simulated statuses) \| `CLICK_TO_CHAT` (builds `wa.me` links; a human sends) \| `META_CLOUD` (real API). **Local: keep `MOCK`.** |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | all five required only if `META_CLOUD` | Secrets. Leave blank locally. Production-only. |
| `WHATSAPP_API_VERSION` | optional | Like `v20.0`. |
| `WHATSAPP_DEFAULT_COUNTRY_CODE` | default `91` | Prefix for bare 10-digit numbers. |
| `WHATSAPP_WEBHOOK_ENABLED` | default true | Literal `false` takes the webhook offline (503). |
| `WHATSAPP_APPROVED_TEMPLATE_NAMES`, `WHATSAPP_TEMPLATE_NAME_<USE_CASE>` | optional | Meta template allow-list/overrides. |
| `WHATSAPP_TEST_RECIPIENT` | optional | Used only by the admin "send test message" diagnostic. **Never set a real customer number.** |
| `WHATSAPP_API_MODE`, `WHATSAPP_CLOUD_API_TOKEN`, `NEXT_PUBLIC_WHATSAPP_BUSINESS_NAME` | legacy | Phase-1 quick-share flow (`src/lib/whatsapp.ts`); default `mock`. |

## Storage (property images, documents)

| Variable | Req. | Notes |
|---|---|---|
| `STORAGE_PROVIDER` | default `DISABLED` | `DISABLED` (uploads return a clear 503; everything else works) \| `R2` \| `S3` \| `FIREBASE`. Local: `DISABLED`. The `MOCK` value exists in `.env.example` comments for tests. |
| `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ENDPOINT` | with `R2` | Non-secret, but also **baked into the CSP at build time**. |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | with `R2` | Secrets, runtime-only. Production-only. Never pass as build args. |
| `R2_SIGNED_URL_EXPIRY_SECONDS`, `R2_PUBLIC_BASE_URL` | optional | Signed-URL TTL (default 300). Public base URL is reserved/unused. |
| `STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_ENDPOINT` | with `S3` | Generic S3/MinIO. Local MinIO from `docker compose` is `http://localhost:9002`. Only if you specifically need upload testing. |
| `FIREBASE_*` | with `FIREBASE` | Never activated in this deployment. Ignore. |
| `MAX_PROPERTY_IMAGE_BYTES`, `MAX_PROPERTY_IMAGE_COUNT`, `MAX_DOCUMENT_BYTES`, `PROPERTY_IMAGE_*`, `INVENTORY_IMPORT_MAX_*` | optional | Size/quality policy overrides. |

## Maps

| Variable | Req. | Notes |
|---|---|---|
| `MAPS_PROVIDER` | default `DISABLED` | `DISABLED` \| `GOOGLE`. Local: `DISABLED` (manual address entry and external "Open in Google Maps" links still work). |
| `GOOGLE_MAPS_SERVER_API_KEY` | with `GOOGLE` | Secret, server-only. |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY` | optional | Public by design; must be domain-restricted in Google Cloud. |
| `GOOGLE_MAPS_MAP_ID`, `GOOGLE_MAPS_DEFAULT_REGION/LANGUAGE/CITY` | optional | Defaults `IN`, `en`, `Delhi`. |

## Lead ingestion webhooks

| Variable | Notes |
|---|---|
| `ACRES_99_WEBHOOK_SECRET` | Bearer secret for `POST /api/integrations/99acres/leads`. **Unset ⇒ endpoint returns 503 and refuses all traffic** (fails closed). Real value exists only on the production server. |
| `ACRES_99_ORGANIZATION_ID` | Tenant override; default `org_default`. |
| `HOUSING_WEBHOOK_SECRET`, `HOUSING_ALLOWED_IPS`, `HOUSING_ORGANIZATION_ID` | Housing.com webhook auth/allow-list/tenant. Leave blank locally. |
| `MAGICBRICKS_API_KEY` | `x-api-key` for the mock MagicBricks route; unset ⇒ 503. |

To test a webhook locally, set a throwaway value in your own `.env` (for example a random string) and call it with `curl`; never reuse a production value.

## Operations / misc

| Variable | Notes |
|---|---|
| `CRON_SECRET` | Bearer for `/api/internal/notifications/sweep`. Unset ⇒ sweep refuses requests. |
| `SENTRY_DSN` | Error reporting; leave blank locally. |
| `SYSTEM_ORGANIZATION_ID` | Org for trusted non-interactive contexts; defaults to `org_default`. |
| `SMTP_*`, `EMAIL_FROM` | Not used by any code path today. |
| `BOOTSTRAP_ADMIN_*`, `BOOTSTRAP_ORGANIZATION_NAME` | Only for `npm run bootstrap:production` (creates the first real admin). Not for local dev. |
| `ALLOW_DEMO_SEED`, `DEMO_SEED_ALLOW_REMOTE`, `ALLOW_AUTOMATION_ON_DEMO_DATA`, `DEMO_REMOVE_CONFIRMATION` | Demo-seed guards. `npm run seed:demo` sets `ALLOW_DEMO_SEED` itself. Do **not** set the "remote" or "production" override variables. |
| `E2E_ENV_FILE`, `E2E_PORT`, `E2E_BASE_URL` | Playwright. Default env file `.env.qa`, port `3100`. |
| `NODE_ENV`, `NEXT_RUNTIME`, `CI` | Set by tooling. |
| `SQLITE_SOURCE_PATH` | One-off legacy migration script. Ignore. |

## Production-only build/deploy variables

`CRM_DOMAIN`, `CRM_DOMAIN_EXTRA`, `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `CRM_IMAGE_TAG`, `PORT`, `HOSTNAME` live only in the server env file consumed by `docker-compose.prod.yml`. See [DEPLOYMENT_OVERVIEW.md](DEPLOYMENT_OVERVIEW.md).

## QA environment (`.env.qa`)

Create it yourself; it is gitignored. Contents (all local):

```
DATABASE_URL="postgresql://crm:crm_dev_password@127.0.0.1:5434/delhi_broker_crm_qa"
DIRECT_URL="postgresql://crm:crm_dev_password@127.0.0.1:5434/delhi_broker_crm_qa"
AUTH_SECRET="<any local string, 16+ chars>"
AUTH_TRUST_HOST="true"
NEXTAUTH_URL="http://localhost:3100"
NEXT_PUBLIC_APP_URL="http://localhost:3100"
WHATSAPP_PROVIDER=MOCK
STORAGE_PROVIDER=DISABLED
MAPS_PROVIDER=DISABLED
REDIS_URL=""
```

`REDIS_URL=""` matters: Next.js also loads `.env`, and an environment variable that is already defined (even as an empty string) wins over `.env`. Without that line a `REDIS_URL` in your dev `.env` leaks into QA, login/API rate limits become live, and the QA seed scripts fail with HTTP 429.

The Playwright safety guard (`tests/e2e/helpers/safety-guard.ts`) throws if the base URL is not `localhost`/`127.0.0.1`, looks like `kpproperties.co.in`, or the database host is not local. See [TESTING.md](TESTING.md).

## Common mistakes

- Copying `.env.example` to `.env.local` (Prisma won't see it).
- Setting `NEXTAUTH_URL` to `https://…` locally without TLS, or building with `NODE_ENV=production` and an `http://` URL: startup validation rejects it.
- Half-setting R2 or S3 credentials: validation requires all or none.
- Setting `WHATSAPP_PROVIDER=META_CLOUD` without all five Meta values: startup fails.

Next: [DATABASE.md](DATABASE.md).
