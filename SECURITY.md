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
- Employees, Payments, Audit Logs, Backups, and System Status are ADMIN/DATA_MANAGER-only (or ADMIN-only) at the API level. Document upload/replace/list stays ADMIN/DATA_MANAGER-only; document *download* is open to any authenticated role but gated per-document by the category + entity-relationship policy above (`document-access.ts`) — a Field Executive reaching the download endpoint for a document they can't access gets a 403, not the document.
- Employee list/detail responses explicitly `select` fields — `passwordHash` is never serialized into a response (a real leak found and fixed during the Phase 2A audit).

## Data privacy
- Public catalogue pages/API (`/p/[id]`, `/share/catalogue/[token]`, `/api/catalogues/[token]/*`) render through a whitelisted DTO (`catalogue-dto.ts`) — owner phone, owner notes, and internal fields are never included, by construction (whitelist, not blocklist).
- Audit log entries redact known-sensitive field names (`passwordHash`, tokens/secrets, Aadhaar/PAN-named fields) before persisting `oldValues`/`newValues`.
- Structured logs (`logger.ts`) redact the same category of fields by key name.
- Documents (identity proofs, agreements, receipts) are never served from a public URL — always a short-TTL (5 min) signed GET generated per-request.

## File storage (Document Vault + property images — R2, S3, and Firebase)
- Provider-independent: `src/lib/storage.ts` dispatches to whichever of `R2`/`S3`/`FIREBASE`/`DISABLED` is active (`src/lib/storage-providers/`) — no call site or API route hardcodes a specific vendor. **R2 is the preferred production provider**; Firebase is an optional fallback that has never been activated (billing was not completed).
- **R2 reuses the S3-compatible provider entirely** (`r2.ts` subclasses `s3.ts`) — same AWS SDK v3 client, same HEAD/PUT/GET/DELETE commands, same presigned-URL mechanism. Only the configuration source differs: `R2_*` env vars, a forced `region: "auto"` (never AWS-specific region logic), and an endpoint derived from `R2_ACCOUNT_ID`. R2 credentials are never logged; presigned R2 URLs are always generated against the R2 S3 API endpoint, never `R2_PUBLIC_BASE_URL` (that variable, if ever set, is for serving already-public assets only and is never used for signing).
- All uploads remain server-mediated for every provider (R2 included) — the browser POSTs file bytes to a Next.js route, which pushes them to the bucket server-side. No provider's credentials or client SDK config ever reach the browser bundle.
- **Firebase is server-mediated only** — the browser never holds a Firebase client SDK config or Admin credentials; it POSTs file bytes to a Next.js route, which pushes them to the bucket via the Admin SDK. `firebase/storage.rules` denies all direct client read/write (`allow read, write: if false;`) as a defense-in-depth backstop, since real authorization is entirely server-side.
- **Object keys never contain identifying text** — `organizations/{orgId}/{entity-segment}/{entityId}/{documents|receipts|images|floor-plans}/{uuid}.{ext}`. No owner/client names, phone numbers, Aadhaar/PAN, emails, or the original file name (kept only in `Document.originalFilename` in Postgres, never in the storage path). This object-key builder (`storage-providers/object-key.ts`) is shared by every provider, including R2.
- **Category-based access control** (`src/lib/document-access.ts`): `AADHAAR`, `PAN`, `REGISTRY`, `OWNERSHIP_PROOF`, `OWNER_IDENTITY`, and `PAYMENT_RECEIPT` are Admin-only; Data Manager gets everything else; Field Executive gets only `GENERAL`-category documents, and only when linked to a lead assigned to them or a property they have an assigned visit for. Enforced server-side on every download/replace/delete call, not just hidden in the UI — identical for every storage provider.
- Property listing images have no category restriction (any authenticated role that can see the property can see its images) but are still never permanently public — even catalogue-safe images are served via short-lived signed URLs (default 5 minutes, never more than 15), generated fresh per request and never persisted in Postgres, localStorage, or logs.
- Every upload is verified post-upload: declared size/MIME against the category's limits, extension/MIME consistency (rejects e.g. a `.pdf` declaring `image/png`), a denylist of dangerous extensions (executables, scripts, HTML, unsanitized SVG, archives, double extensions like `resume.pdf.exe`), and a magic-byte signature check against the actual file bytes (never trusts the client's declared `Content-Type` alone).
- Soft delete is the default (`status: DELETED` / `PropertyImage.status: DELETED`, object left in place); physical deletion of the underlying object is a separate, explicit, Admin-only action (`?physical=true`) and never blocks on a failed cleanup (the DB record change always commits first).
- The R2 bucket is created with public access disabled and an API token scoped to only that bucket with object read/write permissions — see DEPLOYMENT.md "2.5 Cloudflare R2 storage provider" for exact dashboard steps and credential-rotation procedure.

## Input validation
- Every mutating API route validates its body with a Zod schema before touching Prisma — no route spreads raw `req.json()` into a `data:` object.
- CSV imports sanitize formula-injection payloads (`=`, `+`, `-`, `@`, tab, CR at the start of a cell get a leading `'` prefix) before any value is persisted or could later be exported into a spreadsheet.
- File uploads are MIME-allowlisted per category (property images: JPEG/PNG/WebP, 10 MB; documents: PDF/JPEG/PNG, 25 MB) and size-capped before the upload is even authorized; the uploaded object is verified server-side (real size/content-type/magic-bytes, not just what the client claimed) before its `Document`/`PropertyImage` row is marked usable.

## Webhooks
- The Meta WhatsApp webhook verifies `x-hub-signature-256` (HMAC, constant-time comparison) and enforces idempotency via a dedicated `IntegrationWebhookEvent` table before any processing. Signature verification **fails closed**: if `WHATSAPP_APP_SECRET` isn't configured, every webhook is rejected rather than silently accepted (`meta-whatsapp-provider.ts`).
- Outbound WhatsApp session (non-template) messages are blocked outside Meta's 24-hour customer-service window (`whatsapp-window.ts`); template messages are blocked unless their exact Meta template name is confirmed approved via `WHATSAPP_APPROVED_TEMPLATE_NAMES` (`whatsapp-templates.ts`) — neither ever silently falls back to an unapproved send.
- A webhook status update can only move a message's status forward (`QUEUED → SENT → DELIVERED → READ`, `FAILED` terminal) — a stale/out-of-order regression (e.g. a delayed "sent" arriving after "read") is detected and ignored, never applied.
- An inbound WhatsApp message from a phone number matching zero or more than one lead's conversation is never guessed onto a lead — it's flagged and Admin/Data Manager are notified for manual resolution.
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
