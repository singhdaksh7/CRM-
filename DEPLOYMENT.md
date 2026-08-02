# Delhi Broker CRM — Deployment Guide

Updated after Phase 3 (infrastructure hardening). Everything in this document that says "implemented" was built **and verified locally** against real services (Docker Postgres, Redis, and MinIO — see each section for exactly how it was tested), not just written and assumed to work. See `INSTALL.md`, `OPERATIONS.md`, `BACKUP.md`, `RESTORE.md`, `ENVIRONMENT.md`, and `SECURITY.md` for the companion documents this file cross-references.

---

## 1. Database: PostgreSQL (migration complete)

The app now runs on PostgreSQL by default (`prisma/schema.prisma` datasource `provider = "postgresql"`). SQLite is retained only as `prisma/dev.db` (untouched, not deleted) for historical/rollback purposes and its pre-migration migration history lives in `prisma/migrations.sqlite-archive/`.

### 1.1 What changed
- Datasource provider switched from `sqlite` to `postgresql`.
- Migration history was **squashed into one fresh baseline** (`prisma/migrations/20260802023709_init_postgres`) rather than translated migration-by-migration, since Postgres and SQLite migration SQL aren't dialect-compatible and there was no real production data yet to preserve migration-by-migration. The old SQLite migrations are archived, not deleted.
- The baseline migration includes the `org_default` Organization seed row (previously a data-seed statement inside a SQLite migration) — this was a real bug caught during verification (see §1.3).
- `Document.storageKey` column added (Phase 3B) in a follow-up migration (`20260802024743_storage_key`).
- Enums, indexes, foreign keys, and constraints all carried over 1:1 — verified by inspecting `\dt`/`\d` on the live Postgres instance (30 tables, all relations intact).

### 1.2 Local development
`docker-compose.yml` provides Postgres, Redis, and MinIO for local dev:
```bash
docker compose up -d
npx prisma migrate deploy
npm run db:seed
```
`DATABASE_URL` in `.env` points at `postgresql://crm:crm_dev_password@localhost:5434/delhi_broker_crm?schema=public` (port `5434`, not the Postgres default `5432`, to avoid colliding with other local projects — adjust if that port is free on your machine).

### 1.3 Data migration script (built and verified, not just documented)
`scripts/migrate-sqlite-to-postgres.ts` reads every table out of the legacy `prisma/dev.db` (via `sql.js`, a pure-WASM SQLite reader chosen specifically because it needs no native build toolchain) and bulk-inserts into whatever Postgres `DATABASE_URL` currently points at. Table order and Boolean/DateTime coercion are derived automatically from Prisma's DMMF, not hand-maintained.

```bash
SQLITE_SOURCE_PATH=./prisma/dev.db npx tsx scripts/migrate-sqlite-to-postgres.ts
```

**Verified locally**: ran against the real `prisma/dev.db` (containing seed data plus real Phase 2 smoke-test data — Owners, Deals, Payments, Documents, Imports, Audit Logs) into a fresh empty local Postgres. Result: all 26 populated tables migrated with matching row counts, and a spot-check join (`Deal → Owner → Property`) confirmed relationships resolved correctly. Re-running the script is safe (`skipDuplicates: true` on every insert) — running it twice against the same target just no-ops the second time.

**Validation**: the script prints a `console.table` summary (source rows vs. inserted vs. destination count per table) and exits non-zero if any table ends up with fewer rows in Postgres than in SQLite. Relationship integrity is enforced by Postgres itself — every insert goes through real foreign-key constraints, so a `createMany` succeeding *is* the relationship validation (an orphaned FK would throw `P2003`, exactly as it did during testing before the `org_default` seed fix was added).

### 1.4 Backup before migration
`cp prisma/dev.db prisma/dev.db.bak-$(date +%Y%m%d)` before running the migration script against a database that matters. For the target Postgres, take a provider snapshot (or `pg_dump`) before any migration run against non-empty data.

### 1.5 Rollback strategy
- **Before cutover**: `prisma/dev.db` is never modified by the migration script (it only reads). Reverting `DATABASE_URL` to the SQLite value and redeploying the SQLite-provider schema (`prisma/migrations.sqlite-archive/`) restores the exact pre-migration state.
- **After cutover, if a later migration fails**: restore Postgres from its automated snapshot/point-in-time-recovery, then redeploy the last known-good app version. Do not hand-edit `_prisma_migrations`.

---

## 2. File storage (Document Vault) — implemented and verified

`src/lib/storage.ts` is a real S3-compatible client (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`) — not a stub. It works unmodified against both real AWS S3 and any S3-compatible host (MinIO, Cloudflare R2, Backblaze B2); only `STORAGE_ENDPOINT` differs (unset → real AWS; set → the alternate host).

### 2.1 How it works
```
Browser --(1. request upload URL)--> POST /api/documents/upload-url --(presigned PUT, 5 min TTL)-->
Browser --(2. PUT file bytes directly to bucket, server never touches them)-->
Browser --(3. confirm)--> POST /api/documents { storageKey } --(HEAD-verifies the object actually landed + real size)-->
Later:   GET /api/documents/[id] --(presigned GET, 5 min TTL, generated fresh every request)--> signed download URL
```
- **Object key**: `org/{organizationId}/{entityType}/{entityId}/{uuid}-{fileName}` — org isolation baked into the key namespace itself.
- **Upload limits**: 25 MB, enforced server-side before a presigned URL is even issued (`assertUploadAllowed` in `storage.ts`).
- **MIME allowlist**: `application/pdf`, `image/jpeg`, `image/png`, `image/webp` — enforced at presign time via `Content-Type` on the presigned PUT (S3 rejects a mismatched upload).
- **Never public**: documents are only ever served via a short-TTL signed GET generated per-request; the bucket itself should be created private (no public-read policy).
- **Safe replace/delete**: `replaceDocument` writes a *new* object key and marks the old `Document` row `EXPIRED` (previous object stays intact, recoverable). `DELETE` soft-deletes the metadata row (`status: "DELETED"`) without removing the underlying object — deliberate, for retention/undo.
- **Legacy mode preserved**: `Document.fileUrl` (a plain external URL) still works for callers who already host files elsewhere — `storageKey` and `fileUrl` are mutually exclusive per document, both fully supported by the schema.

### 2.2 Verified locally against MinIO
Full lifecycle tested end-to-end with the local MinIO container from `docker-compose.yml`: presigned PUT → real file upload → server-side HEAD verification (confirmed real size/content-type) → presigned GET returning the exact uploaded bytes → delete → subsequent GET correctly 404s. `GET /api/system/status` reports `storage: "ok"` with the configured bucket/endpoint once `STORAGE_BUCKET`/`STORAGE_ACCESS_KEY_ID`/`STORAGE_SECRET_ACCESS_KEY` are set, `"not_configured"` otherwise (legacy `fileUrl` mode).

### 2.3 Production setup
Provision a private S3 bucket (or MinIO/R2/B2 equivalent), create an IAM user/access key scoped to just that bucket (`s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, `s3:HeadObject`), and set `STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` (leave `STORAGE_ENDPOINT` unset for real AWS). See `.env.example`.

---

## 3. Rate limiting — implemented and verified

`src/lib/rate-limit.ts` is a fixed-window Redis limiter (`ioredis` — standard Redis wire protocol, works against local Docker Redis, Upstash's Redis endpoint, or any managed Redis; not locked to one vendor's proprietary REST client). **Fails open** if `REDIS_URL` is unset or Redis is unreachable (never lets a limiter outage take the whole app down) — meaning limits are only *enforced* once `REDIS_URL` is set in the deployment environment.

Wired into: login (`authorize` callback in `auth.ts`, keyed by IP+email), public catalogue view/interactions, both lead-ingestion webhooks, the WhatsApp webhook, imports, document upload-url requests, document creation, and payment creation. Health/readiness are deliberately **not** rate-limited (orchestrators poll them continuously by design).

Every limit is env-overridable (`RATE_LIMIT_<NAME>_MAX` / `RATE_LIMIT_<NAME>_WINDOW_SECONDS`) — defaults in `rate-limit.ts`.

**Verified locally**: ran 12 sequential requests against the `login` limiter (default: 10 per 5 minutes) using the real local Redis container — requests 1–10 returned `allowed: true` with decrementing `remaining`, requests 11–12 correctly returned `allowed: false`.

---

## 4. Environment validation — implemented and verified

`src/instrumentation.ts` (Next.js's standard startup hook, placed under `src/` per this project's `src/`-rooted convention) calls `validateEnv()` from `src/lib/env.ts` once when the server process starts, **before serving any request**. Missing/malformed required vars (or invalid conditional combinations — e.g. `WHATSAPP_PROVIDER=META_CLOUD` without credentials, or a non-`https://` `NEXTAUTH_URL` when `NODE_ENV=production`) cause the process to log a single aggregated error and `exit(1)` immediately.

**Verified locally, both directions**: (1) valid `.env` → server starts cleanly, no errors; (2) `AUTH_SECRET` shortened below the minimum length → server process logged the exact validation error and exited (confirmed via process list — no orphaned node process survived the failure).

---

## 5. Logging & monitoring — implemented

- **`src/lib/logger.ts`**: structured JSON to stdout, redacts a fixed list of sensitive key names (passwords, tokens, cookies, notes/feedback fields) regardless of which log call includes them. Every unhandled API error gets a `requestId` (UUID) that's returned to the client and logged server-side, so a user-reported error can be traced to its exact server log line without ever exposing a stack trace to the client.
- Domain events logged: `import_job_started/completed/rolled_back`, `payment_marked_paid`, `document_uploaded/replaced/deleted`, `whatsapp_webhook_received/message_failed`, `lead_webhook_ingested`.
- **`src/lib/monitoring.ts`**: optional Sentry hook. `@sentry/nextjs` is installed (free SDK, no cost to install) but `Sentry.init()` is only ever called if `SENTRY_DSN` is set — with it unset, zero network calls to Sentry happen and the app behaves identically to not having the package at all. Wired into `handleApiError` so every unhandled server error reaches it automatically once a DSN is configured.
- No paid logging/monitoring provider is required or auto-configured — point your platform's log drain (Vercel Logs, CloudWatch, Docker `json-file` driver, etc.) at stdout.

---

## 6. Environment variables

See `ENVIRONMENT.md` for the full annotated list. Required at minimum: `DATABASE_URL`, `AUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`. `AUTH_TRUST_HOST=true` is required when deployed behind a reverse proxy/load balancer that terminates TLS (verified necessary in the Docker container test — NextAuth v5 otherwise rejects the request as an untrusted host).

---

## 7. Security headers — implemented and verified

`next.config.ts`'s `headers()` applies `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`, and a `Content-Security-Policy` to every route, plus `Cache-Control: no-store, must-revalidate` on every `/api/*` response (financial/PII data must never be cached by a browser or intermediate proxy). Verified live via `curl -I` against both `/login` (all headers present) and an authenticated `/api/dashboard` call (`Cache-Control: no-store` confirmed). See `SECURITY.md` for the CSP's known trade-off (`'unsafe-inline'` on `script-src`, required by Next.js's hydration bootstrap script — tightening to nonce-based CSP is a documented follow-up, not done here since it can't be visually verified without a browser in this environment).

---

## 8. CI/CD

`.github/workflows/ci.yml` runs on every push/PR to `main`/`master`: install → `prisma validate` → `prisma generate` → `prisma migrate deploy` (against a real Postgres service container) → `tsc --noEmit` → `eslint` → `vitest run` → `next build --webpack` → upload build artifact. Every step in this pipeline was run manually, locally, against the same real Postgres-backed setup during this hardening pass (see §12) — the workflow file encodes exactly those verified commands, not untested guesses.

**To actually prevent merges on failure**: enable a GitHub branch protection rule requiring the `build-and-test` check on `main`/`master` (Settings → Branches → branch protection rules). This is a repository-configuration step, not a file in this repo, and wasn't done here — the repository has no GitHub remote configured yet.

---

## 9. Docker — implemented and verified

- **`Dockerfile`**: 3-stage build (deps → build → runner) on `node:20-slim`. Runs as a non-root user, includes `HEALTHCHECK`, and runs `prisma migrate deploy` before `next start` on every container start (idempotent — a no-op if already applied).
- **`docker-compose.yml`**: local dev infra (Postgres, Redis, MinIO) — this is what every Phase 3 verification in this document actually ran against.
- **`docker-compose.prod.yml`**: production-shaped example (app + Postgres + Redis; object storage is intentionally NOT a container here — production storage should be a real managed bucket, not self-hosted MinIO).

**Built and run locally, twice, fixing two real bugs found only by actually running the container** (not just reading the Dockerfile):
1. Prisma's query engine is compiled against whichever OpenSSL version it detects at `prisma generate` time. The `node:20-slim` base image has no OpenSSL by default, so the `builder` and `runner` stages must install the *same* OpenSSL version or the container fails at startup with "could not locate the Query Engine". Fixed by installing `openssl` in both stages.
2. The non-root `nextjs` user couldn't write to `node_modules/@prisma` (owned by `root` after a plain `COPY`). Fixed with `--chown=nextjs:nodejs` on every `COPY --from=builder`.

After both fixes: the container started cleanly, applied migrations against the real Postgres container over the Docker network, and answered `GET /api/system/health` (200) and `/api/system/readiness` (200, DB reachable) correctly.

---

## 10. Deployment options

### Option A — Fast internal pilot: Vercel + managed Postgres + Upstash Redis
- `vercel deploy` — Webpack build already configured (`next build --webpack`; Turbopack is never enabled, per project policy).
- Managed Postgres + Upstash Redis via Vercel Marketplace — a few minutes to provision, connection strings auto-injected.
- Object storage: AWS S3 (or an S3-compatible Marketplace option) — Vercel Functions don't provide persistent local disk, so storage must be external regardless of platform.
- **Best for**: showing the brokerage team a live pilot fast, near-zero ops overhead.
- **Cost**: lowest to start (usage-based, free tiers cover a single-brokerage pilot's traffic). **Complexity**: lowest. **Scalability**: good for pilot/moderate traffic, serverless cold starts are a minor concern at very low traffic. **Maintenance**: lowest (managed everything).

### Option B — Controlled production: Docker/AWS (ECS/Fargate) + RDS Postgres + ElastiCache Redis + S3
- Deploy the `Dockerfile` image to ECS/Fargate (or any Docker-capable host) behind an ALB.
- RDS Postgres + ElastiCache Redis + S3, all in the same VPC for private networking between app and data services.
- Full control over scaling, networking, WAF, and compliance posture — relevant once real identity documents are flowing through the Document Vault.
- **Cost**: higher baseline (always-on infra vs. usage-based), better at sustained scale. **Complexity**: highest (VPC, IAM, ECS task definitions, ALB, RDS parameter groups). **Scalability**: highest ceiling, full control. **Maintenance**: highest (you own patching, scaling policy, backups configuration).

### Recommendation
**Start with Option A for the pilot.** This app's traffic profile (single brokerage, internal staff, no high-volume public write endpoints beyond catalogue interactions — now rate-limited regardless) fits serverless well, and it's the fastest path onto real Postgres + Redis + S3, none of which existed before this pass. **Move to Option B when**: (a) the Document Vault is handling real identity documents at a scale where private-VPC storage networking matters, or (b) traffic/compliance requirements genuinely outgrow serverless. Neither applies yet based on current usage patterns.

---

## 11. Deployment checklist

### Pre-deployment
- [ ] Database backed up (`pg_dump` or provider snapshot)
- [ ] All required env vars set (`ENVIRONMENT.md`) — validated automatically at startup (§4), but confirm no placeholder/dev values
- [ ] `npx prisma migrate deploy` previewed (review `prisma/migrations/*/migration.sql` since the last deploy)
- [ ] `npx vitest run` green (165/165 at time of writing)
- [ ] `npm run build` succeeds
- [ ] Admin bootstrap: run `npm run bootstrap:production` (§12) — never run `npm run db:seed` against production, it creates demo data and hardcoded passwords
- [ ] Storage bucket reachable, IAM credentials scoped correctly (§2.3)
- [ ] `REDIS_URL` set and reachable (rate limiting fails open without it — deploying without Redis is *allowed* but means limits aren't enforced)
- [ ] Public catalogue URL resolves from outside the deploy network

### Deployment
1. `npm ci`
2. `npx prisma generate`
3. `npx prisma migrate deploy`
4. `npm run build` (Webpack)
5. `npm start` (or `docker compose -f docker-compose.prod.yml up -d`)
6. `GET /api/system/health` → `200`
7. `GET /api/system/readiness` → `200 {"ready":true}`
8. Run the smoke tests in `OPERATIONS.md`

### Post-deployment
See `OPERATIONS.md` "Post-deployment smoke tests" for the full checklist (login, RBAC, property/lead/deal/payment/document/import/audit-log flows).

### Rollback
See `RESTORE.md`.

---

## 12. Production Admin bootstrap

`prisma/seed.ts` creates demo employees/properties/leads/deals with hardcoded passwords (`Admin@123`, etc.) — it exists purely for local development and **must never be run against production**.

`scripts/bootstrap-admin.ts` (`npm run bootstrap:production`) is the production-safe alternative:
- Creates the default organization (`org_default`) only if it doesn't already exist (it normally does — the baseline migration seeds it).
- Creates exactly one Admin account only if no Admin exists anywhere; never overwrites an existing Admin.
- Reads `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, and optional `BOOTSTRAP_ORGANIZATION_NAME` from the environment — see `.env.example`.
- Hashes the password with the same `bcryptjs` used by `auth.ts`; enforces a minimum-strength password (12+ chars, upper/lower/digit/symbol) and rejects known dev/demo passwords outright.
- Never logs the password. Records a `CREATE` audit log entry for the organization (if created) and the Admin user.
- Safe to run repeatedly — a second run is a no-op once the Admin exists.

Run it once after `prisma migrate deploy`, then unset/remove the `BOOTSTRAP_ADMIN_*` variables from the deployment environment.
