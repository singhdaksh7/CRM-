# Security

Summary of the security posture as of Phase 3. See `DEPLOYMENT.md` for infra-level detail and the conversation history / code review notes for the full Phase 2A audit findings and fixes.

## Authentication & sessions
- NextAuth v5, JWT session strategy, credentials provider with bcrypt password hashing.
- Login is rate-limited (10 attempts / 5 min per IP+email, Redis-backed, fails open without Redis — see `ENVIRONMENT.md`).
- Cookies are `httpOnly`, `SameSite=Lax`; `Secure` is applied automatically by NextAuth when `NEXTAUTH_URL` is `https://`.
- `AUTH_SECRET` must be rotated for production (never reuse the development value) — rotating it invalidates all existing sessions (expected).

## Authorization (RBAC)
- Three roles: `ADMIN`, `DATA_MANAGER`, `FIELD_EXECUTIVE`.
- Every mutating API route calls `requireSession(allowedRoles)`; every org-scoped read/write filters by `organizationId`.
- `FIELD_EXECUTIVE` is restricted to records assigned to them (leads, deals, visits) — enforced server-side, not just hidden in the UI.
- Employees, Payments, Documents, Audit Logs, Backups, and System Status are ADMIN/DATA_MANAGER-only (or ADMIN-only) at the API level.
- Employee list/detail responses explicitly `select` fields — `passwordHash` is never serialized into a response (a real leak found and fixed during the Phase 2A audit).

## Data privacy
- Public catalogue pages/API (`/p/[id]`, `/share/catalogue/[token]`, `/api/catalogues/[token]/*`) render through a whitelisted DTO (`catalogue-dto.ts`) — owner phone, owner notes, and internal fields are never included, by construction (whitelist, not blocklist).
- Audit log entries redact known-sensitive field names (`passwordHash`, tokens/secrets, Aadhaar/PAN-named fields) before persisting `oldValues`/`newValues`.
- Structured logs (`logger.ts`) redact the same category of fields by key name.
- Documents (identity proofs, agreements, receipts) are never served from a public URL — always a short-TTL (5 min) signed GET generated per-request.

## Input validation
- Every mutating API route validates its body with a Zod schema before touching Prisma — no route spreads raw `req.json()` into a `data:` object.
- CSV imports sanitize formula-injection payloads (`=`, `+`, `-`, `@`, tab, CR at the start of a cell get a leading `'` prefix) before any value is persisted or could later be exported into a spreadsheet.
- File uploads are MIME-allowlisted (`application/pdf`, `image/jpeg`, `image/png`, `image/webp`) and size-capped (25 MB) at presign time; the uploaded object is HEAD-verified server-side (real size/content-type, not just what the client claimed) before its `Document` row is marked usable.

## Webhooks
- The Meta WhatsApp webhook verifies `x-hub-signature-256` (HMAC) and enforces idempotency via a dedicated `IntegrationWebhookEvent` table before any processing.
- The 99acres/Magicbricks mock lead-ingestion webhooks support an optional shared-secret (`x-api-key`, checked against `ACRES_99_API_KEY`/`MAGICBRICKS_API_KEY`) — **set these in production**; left unset, those two routes stay open (documented mock-mode default, not an oversight).
- All three webhook routes are rate-limited (120 req/min per IP by default).

## Transport & headers
- Production (`NODE_ENV=production`) requires `NEXTAUTH_URL` to be `https://` — enforced at startup, not just recommended.
- Every response carries: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geolocation disabled), `Strict-Transport-Security` (2yr, includeSubDomains, preload), and a `Content-Security-Policy`.
- **Known CSP trade-off**: `script-src` includes `'unsafe-inline'` because Next.js App Router injects a small inline hydration bootstrap script on every page. A nonce-based CSP would remove this, but wasn't implemented here — it needs browser-based verification to confirm it doesn't silently break client-side interactivity, and no browser was available in the environment this hardening pass ran in. **Follow-up**: implement nonce-based CSP via middleware and verify in a real browser before tightening.
- Every `/api/*` response is `Cache-Control: no-store, must-revalidate` — financial/PII API responses are never cached by a browser or intermediate proxy.

## Rate limiting
See `ENVIRONMENT.md` "Rate limiting" for the full list of protected endpoints and configurable limits.

## Known gaps / not implemented
- **No nonce-based CSP** (see above) — current CSP still blocks framing, restricts script/style/img/connect origins to `'self'` (plus the one external image host), which meaningfully reduces XSS/clickjacking blast radius even without tightening `script-src` further.
- **No CSRF token on custom mutating endpoints** — relies on NextAuth's own CSRF protection for the credentials flow, same-origin cookie policy (`SameSite=Lax`), and session-based auth for everything else. A dedicated CSRF token per mutating request was not added.
- **Rate limiting fails open** if Redis is unreachable — a deliberate availability-over-strictness trade-off; monitor `REDIS_URL` connectivity via `/api/system/status` in production.
- **CSV import duplicate-detection has a narrow race window** under concurrent imports of overlapping data — acceptable at expected usage volume (a brokerage admin running occasional bulk imports, not concurrent automated imports).
