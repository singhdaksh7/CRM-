# Environment Variables

Full reference for every variable the app reads. See `.env.example` for a ready-to-copy template (placeholders only — never commit real values). Required variables are validated at process startup (`src/lib/env.ts`, run via `src/instrumentation.ts`) — the process refuses to start if they're missing or malformed.

## Required

| Variable | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db?schema=public` | PostgreSQL connection string. Local dev default (via `docker-compose.yml`): `postgresql://crm:crm_dev_password@localhost:5434/delhi_broker_crm?schema=public` |
| `AUTH_SECRET` | long random string, 32+ chars | NextAuth JWT signing secret. **Rotate for production** — never reuse the dev value. Generate with `openssl rand -base64 32`. |
| `NEXTAUTH_URL` | `https://crm.example.com` | Must be `https://` when `NODE_ENV=production` (enforced by `env.ts`). |
| `NEXT_PUBLIC_APP_URL` | `https://crm.example.com` | Public origin, used to build catalogue/WhatsApp share links. Should match `NEXTAUTH_URL`. |

## Auth / hosting

| Variable | When needed | Notes |
|---|---|---|
| `AUTH_TRUST_HOST` | Behind a reverse proxy/load balancer terminating TLS (Docker/ECS/most PaaS) | Set `"true"`. Vercel doesn't need this. Confirmed required in local Docker testing — omitting it causes NextAuth to reject requests as an untrusted host. |

## WhatsApp

| Variable | When needed | Notes |
|---|---|---|
| `WHATSAPP_PROVIDER` | Always | `MOCK` \| `CLICK_TO_CHAT` \| `META_CLOUD`. Defaults to `MOCK`. |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | `META_CLOUD` only | All four required together — validated at startup. |
| `WHATSAPP_API_VERSION` | Optional | Defaults to `v20.0`. |

## Lead-ingestion webhooks

| Variable | When needed | Notes |
|---|---|---|
| `ACRES_99_API_KEY` | Recommended in production | If set, `POST /api/integrations/leads/99acres` requires this exact value in the `x-api-key` header. Unset = endpoint stays open (mock-mode default). |
| `MAGICBRICKS_API_KEY` | Recommended in production | Same, for `/api/integrations/leads/magicbricks`. |

## File storage (Document Vault + property images)

| Variable | When needed | Notes |
|---|---|---|
| `STORAGE_PROVIDER` | Always (has a default) | `DISABLED` (default) \| `R2` \| `S3` \| `FIREBASE`. Selects the provider in `src/lib/storage-providers/`. `DISABLED` means upload endpoints return a clear 503; every other page keeps working. `R2` (Cloudflare R2) is the preferred production provider. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | `STORAGE_PROVIDER=R2` | Required together when R2 is selected. See DEPLOYMENT.md "2.5 Cloudflare R2 storage provider". |
| `R2_ENDPOINT` | Optional with R2 | Overrides the derived `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com` endpoint. Either this or `R2_ACCOUNT_ID` is required when `STORAGE_PROVIDER=R2`. |
| `R2_SIGNED_URL_EXPIRY_SECONDS` | Optional with R2 | Defaults to `300` (5 minutes). Applies to both upload and download presigned URLs. |
| `R2_PUBLIC_BASE_URL` | Not used yet | Reserved for a future public-asset delivery path. Leave empty - the bucket stays private and all delivery is via short-lived signed URLs. Never used for presigning. |
| `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` | `STORAGE_PROVIDER=S3` | Required together when the generic S3 provider (real AWS S3, or MinIO locally) is selected. |
| `STORAGE_REGION` | With the above | Defaults to `us-east-1`. |
| `STORAGE_ENDPOINT` | S3-compatible non-AWS host (MinIO, Backblaze B2) | Leave unset for real AWS S3. Local dev default: `http://localhost:9002` (MinIO via `docker-compose.yml`). Use the dedicated `R2` provider (not this one) for Cloudflare R2. |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_STORAGE_BUCKET` | `STORAGE_PROVIDER=FIREBASE` | Required together (validated) when Firebase is selected. Optional fallback provider only - never activated in this deployment (billing was not completed). From a Firebase service-account JSON - see DEPLOYMENT.md "2.4 Firebase Storage provider". `FIREBASE_PRIVATE_KEY` keeps its literal `\n` sequences; `src/lib/firebase-admin.ts` un-escapes them. Never prefix with `NEXT_PUBLIC_`. |

## Rate limiting

| Variable | When needed | Notes |
|---|---|---|
| `REDIS_URL` | To enforce rate limits | `redis://host:port`. Works with local Docker Redis, Upstash's Redis endpoint, or any standard Redis. Unset = rate limiting fails open (not enforced). Local dev default: `redis://localhost:6380`. |
| `RATE_LIMIT_LOGIN_MAX` / `RATE_LIMIT_LOGIN_WINDOW_SECONDS` | Optional | Default 10 per 300s. |
| `RATE_LIMIT_CATALOGUE_MAX` / `_WINDOW_SECONDS` | Optional | Default 60 per 60s. |
| `RATE_LIMIT_WEBHOOK_MAX` / `_WINDOW_SECONDS` | Optional | Default 120 per 60s. |
| `RATE_LIMIT_IMPORT_MAX` / `_WINDOW_SECONDS` | Optional | Default 5 per 300s. |
| `RATE_LIMIT_UPLOAD_MAX` / `_WINDOW_SECONDS` | Optional | Default 30 per 60s. |
| `RATE_LIMIT_DOCUMENT_MAX` / `_WINDOW_SECONDS` | Optional | Default 100 per 60s. |
| `RATE_LIMIT_PAYMENT_MAX` / `_WINDOW_SECONDS` | Optional | Default 30 per 60s. |
| `RATE_LIMIT_DOCUMENT_DOWNLOAD_MAX` / `_WINDOW_SECONDS` | Optional | Default 60 per 60s. |
| `RATE_LIMIT_DOCUMENT_REPLACE_MAX` / `_WINDOW_SECONDS` | Optional | Default 20 per 60s. |
| `RATE_LIMIT_DOCUMENT_DELETE_MAX` / `_WINDOW_SECONDS` | Optional | Default 20 per 60s. |
| `RATE_LIMIT_PROPERTY_IMAGE_UPLOAD_MAX` / `_WINDOW_SECONDS` | Optional | Default 30 per 60s. |
| `RATE_LIMIT_PROPERTY_IMAGE_ACCESS_MAX` / `_WINDOW_SECONDS` | Optional | Default 120 per 60s. |

## Production Admin bootstrap (one-time)

| Variable | When needed | Notes |
|---|---|---|
| `BOOTSTRAP_ADMIN_NAME` | Running `npm run bootstrap:production` | Admin's display name. |
| `BOOTSTRAP_ADMIN_EMAIL` | Same | Must not already belong to a non-Admin user. |
| `BOOTSTRAP_ADMIN_PASSWORD` | Same | 12+ chars, upper+lower+digit+symbol; known dev/demo passwords are rejected. Never logged. |
| `BOOTSTRAP_ORGANIZATION_NAME` | Optional | Defaults to `"Delhi Broker CRM"`. Only used if `org_default` doesn't already exist. |

Never run `npm run db:seed` against production — see `DEPLOYMENT.md` §12. Unset these four variables from the deployment environment after the bootstrap script has run once.

## Monitoring (optional)

| Variable | When needed | Notes |
|---|---|---|
| `SENTRY_DSN` | To enable error monitoring | Unset = `@sentry/nextjs` is installed but completely inert (no network calls, no cost). |

## Email (not yet used by any code path)

| Variable | Notes |
|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | Reserved for a future email-notification feature. `/api/system/status` reports `email: "not_configured"` without them. |

## Never commit real values
`.env` is gitignored. `.env.example` contains placeholders/empty strings only. If you rotate a leaked secret, also invalidate any active sessions signed with the old `AUTH_SECRET` (all users will need to log in again — this is expected and correct).
