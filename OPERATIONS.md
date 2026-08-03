# Operations

## Health & readiness
- `GET /api/system/health` — liveness only, always `200` if the process is up. Public, unauthenticated, unrated-limited. Point your orchestrator's liveness probe here.
- `GET /api/system/readiness` — `200` only once the database is reachable and required env vars are set, `503` otherwise. Public, unauthenticated. Point your orchestrator's readiness probe here.
- `GET /api/system/status` — ADMIN-only, detailed breakdown (database, environment, storage, email, WhatsApp). Use for manual diagnosis, not automated health checks (it's authenticated and heavier).

## Post-deployment smoke tests
Run after every deployment (see `DEPLOYMENT.md` §11 for the full pre/deploy/post checklist). Each of these was verified working during Phase 2/3 hardening against a real Postgres + Redis + MinIO stack:

1. **Login** — real admin credentials, confirm session cookie set.
2. **RBAC** — a FIELD_EXECUTIVE account gets `403` on `/api/employees/[id]`, `/api/payments`, `/api/documents`, `/api/audit-logs`; gets `200` on records assigned to them, `403` on records assigned to someone else.
3. **Property** — create, list, filter.
4. **Lead** — create, auto-assign, matching.
5. **WhatsApp** — `MOCK`/`CLICK_TO_CHAT` need no live credentials; if `META_CLOUD`, send one real test message.
6. **Public catalogue privacy** — open a `/share/catalogue/[token]` link in an incognito window/private request, confirm owner phone/notes are never present in the response.
7. **Owner** — create, verify workflow, analytics.
8. **Deal** — create → stage transitions (confirm an invalid transition, e.g. `CLOSED_LOST` without a reason, is rejected) → `CLOSED_WON`.
9. **Brokerage** — calculate on a deal, confirm `deal.brokerageAmount` updates.
10. **Payment** — partial payment, then an overpayment attempt (must be rejected), then the exact remaining balance (must succeed with a receipt number generated).
11. **Document** — request an upload URL, upload, confirm metadata + download URL both work, soft-delete, confirm excluded from subsequent listings.
12. **Import** — a small CSV with one valid, one duplicate, one invalid row; confirm the job summary counts match.
13. **Audit log** — confirm entries exist for every write above, visible only to ADMIN, with sensitive fields redacted.
14. **Rate limiting** (if `REDIS_URL` is set) — confirm `/api/system/status` doesn't flag Redis as unreachable; optionally hammer the login endpoint past its limit and confirm a `429`.

## Troubleshooting

### Server won't start: "Invalid environment configuration"
Read the listed variables in the error — it's an aggregated list of every problem found, not just the first one. Check `ENVIRONMENT.md`. Common causes: `AUTH_SECRET` too short, `NEXTAUTH_URL` not `https://` in production, `WHATSAPP_PROVIDER=META_CLOUD` missing one of its three required credentials.

### "Prisma Client could not locate the Query Engine for runtime ..."
Only relevant to a self-built Docker image. Means the `builder` and `runner` stages detected different OpenSSL versions at build vs. runtime. The shipped `Dockerfile` installs `openssl` in both stages specifically to prevent this (found and fixed during Phase 3 Docker verification) — if you've modified the Dockerfile's base image, make sure both stages still install matching OpenSSL.

### "Error: Can't write to /app/node_modules/@prisma/engines"
Docker-only. The non-root container user doesn't own the copied files. Confirm every `COPY --from=builder` in the Dockerfile has `--chown=nextjs:nodejs` (this was a real bug found and fixed during Phase 3 verification).

### Login returns `UntrustedHost` error
Set `AUTH_TRUST_HOST=true` — required whenever a reverse proxy/load balancer terminates TLS in front of the app container (confirmed necessary in local Docker testing).

### `/api/system/status` shows `storage: "not_configured"`
Expected unless a full provider's variables are set: `STORAGE_PROVIDER=R2` needs `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, and either `R2_ACCOUNT_ID` or `R2_ENDPOINT`; `STORAGE_PROVIDER=S3` needs `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` (see `ENVIRONMENT.md`). Documents still work in "legacy mode" (external `fileUrl`) without any provider configured.

### `/api/system/status` shows `storage: "error"` with `STORAGE_PROVIDER=R2`
The config-existence check passed (all `R2_*` variables are set) but something else is wrong. Common causes: the Cloudflare API token was revoked or scoped to the wrong bucket, `R2_BUCKET_NAME` doesn't match the bucket the token is scoped to, or `R2_ACCOUNT_ID`/`R2_ENDPOINT` points at the wrong Cloudflare account. Run the Admin-only deep test (`POST /api/system/storage-health`) for a real upload/HEAD/signed-URL/delete round trip — its per-step breakdown pinpoints which operation is failing without ever exposing the credentials themselves.

### Rate limit `429` responses under normal use
Check `REDIS_URL` connectivity and whether the default limits (`ENVIRONMENT.md` "Rate limiting") fit your actual usage pattern — they're deliberately conservative defaults and fully env-overridable per rule.

### Port conflicts running `docker compose up -d` locally
`docker-compose.yml` uses non-default host ports (Postgres `5434`, Redis `6380`, MinIO `9002`/`9003`) specifically to avoid colliding with other local projects. If those are also taken, edit the `ports:` mappings in `docker-compose.yml` and update `.env` to match.

## Upgrade strategy
1. Review the target Next.js/Prisma/dependency changelog for breaking changes.
2. Update one major dependency at a time (not a blanket `npm update`), run `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, and `npm run build` after each.
3. For a Prisma major version bump specifically: re-run `npx prisma validate` and `npx prisma generate`, and check whether any migration SQL syntax changed (rare, but check the Prisma release notes).
4. Deploy to a staging/pilot environment first (Option A in `DEPLOYMENT.md` is well-suited as a staging target even if production runs on Option B) and run the full smoke-test checklist above before promoting to production.
5. Never upgrade Node.js, Next.js, or Prisma at the same time as a schema migration — isolate variables so a regression is traceable to one change.

## Logs
Structured JSON on stdout (`src/lib/logger.ts`). Point your platform's log drain at stdout — no paid provider required. Every unhandled API error includes a `requestId`; grep logs for that ID (also returned to the client) to trace a specific user-reported incident to its exact server-side error and stack trace.
