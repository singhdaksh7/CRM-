# Property portal integrations

## Architecture

`Provider -> adapter -> normalized lead -> idempotency -> listing mapping -> ExternalLeadEvent -> CRM Lead -> assignment`.

All adapters are server-only. They must use an official, authorized provider contract and must never scrape, automate a browser, or call undocumented endpoints. A provider with no verified contract remains **AWAITING_PROVIDER_ACCESS**.

## Normalized lead

`CanonicalPortalLead` holds provider IDs, event/lead/listing IDs, contact details, message, enquiry type, received time, safe source metadata, and normalized requirement fields. Raw payloads are hashed; only bounded safe snapshots are retained for staff review.

## Idempotency and tenancy

Events are unique per organization and provider. Connection-backed events namespace provider event IDs by connection; legacy Housing IDs retain their existing representation. Fallback delivery deduplication uses a SHA-256 payload fingerprint. Incoming payloads never select an organization.

## Listing mapping

An incoming external listing is resolved within the organization, provider, and (when known) connection. Exactly one result is linked to `PortalListing`; unknown and ambiguous listings retain the lead event without silently attaching a CRM Property.

## Email ingestion

The framework accepts only messages obtained from an approved mailbox mechanism. Sender/domain rules are configured server-side; an email that merely claims to be from a portal is rejected. Housing, OLX, MagicBricks, and 99acres parsers are **AWAITING_SAMPLE** until sanitized, provider-approved sample messages are supplied. Email idempotency uses the mailbox's stable message ID.

## OLX Dealer Lead Sharing API (pull-based)

Unlike Housing (inbound webhook), OLX is **pull-based**: this app calls OLX on a
schedule. Code lives entirely under `src/integrations/olx/` (auth/fetch client,
zod schemas, adapter, sync orchestration) plus two API routes; it is
deliberately kept out of `src/integrations/property-portals/` and
`src/app/api/integrations/` credential reads, matching the Housing pattern, so
the repo-wide "no portal module reads a provider credential" guard
(`provider-safety.test.ts`) continues to hold for the contract-only providers
while OLX - a genuinely implemented pull integration - lives in its own module.

**No OLX SOP document was supplied to this implementation.** The endpoint
contract given (base URL, auth headers/response field names, lead-fetch query
params, the 7-day/100-row limits) is implemented verbatim; a small number of
gaps not covered by that contract are filled with explicit, commented
assumptions in `src/integrations/olx/schema.ts`, `client.ts`, `adapter.ts`,
and `sync.ts` - most importantly: the login request body's field names, the
leads-fetch response envelope/pagination shape, whether "ad data"
(title/desc/price/lat/long/parameters) is delivered embedded per-lead versus
via a separate lookup call, and the `startDate`/`endDate` query format. Each
assumption is isolated to one file/function so it can be corrected quickly
once real OLX response samples are available - **nothing here has been
verified against a live OLX account**, only against mocked HTTP responses in
tests.

### Environment variables (names only)

- `OLX_DEALER_LOGIN`, `OLX_DEALER_PASSWORD` - dealer credentials, server-only, read only in `src/integrations/olx/config.ts`.
- `OLX_API_BASE_URL` - defaults to `https://business.olx.in` if unset.
- `OLX_DEV_MODE` - must be explicitly set to `"true"` (and never in a `NODE_ENV=production` deploy) to send the sandbox-only `x-origin-panamera: dev` header. Off by default.
- `OLX_INITIAL_LOOKBACK_HOURS` - first-sync bounded lookback when a connection has no cursor yet (default 24).
- `OLX_SYNC_OVERLAP_MINUTES` - overlap subtracted from the cursor on every incremental sync (default 10).
- `CRON_SECRET` - already exists in this project; also protects `/api/internal/olx/sync`.

### Auth / token behavior

`src/integrations/olx/client.ts` authenticates via `POST /api/v1/auth/login`
(`Content-Type: text/plain`, `client-language: en-IN`, plus the dev header
only when `OLX_DEV_MODE=true` outside production). The access token, user id
and an expiry (15 minutes minus a small safety margin) are cached in a
module-level variable that lives only as long as one serverless invocation -
Vercel gives no durable memory between invocations, so re-authenticating once
per cron/admin-triggered run is expected and correct; nothing is persisted to
the DB. On a `403` from the leads endpoint, the client re-authenticates
**exactly once** and retries the original request **exactly once**; a second
403 is surfaced as a failure, never retried in a loop. Tokens and credentials
are never logged.

### Polling / cursor / backfill behavior

`PropertyPortalConnection.lastSuccessfulSyncAt` is the sync cursor (per
connection, per organization) - no new column was needed. Each sync run:

1. Computes `startDate` as `lastSuccessfulSyncAt` minus `OLX_SYNC_OVERLAP_MINUTES` (or a bounded `OLX_INITIAL_LOOKBACK_HOURS` lookback on first sync).
2. Chunks `[startDate, now]` into `<=7`-day windows (OLX's documented maximum date range), oldest first.
3. Fetches and ingests leads window-by-window, **page-by-page**, calling `ingestPortalLead` immediately after each page - so a failure on a later page/window never discards leads already ingested from earlier ones.
4. Advances `lastSuccessfulSyncAt` only up to the end of the last window that completed fully; a failed window is naturally retried (with the standard overlap) on the next run - the cursor lives entirely in the DB row, so a server restart loses nothing.
5. A historical backfill beyond 7 days is simply a longer `[startDate, now]` range fed through the same chunking - no separate code path.

Overlapping pulls and duplicate OLX lead replays are made safe by
`ingestPortalLead`'s existing `ExternalLeadEvent` dedup - this module does not
implement its own deduplication.

The cron endpoint `GET/POST /api/internal/olx/sync` runs every 30 minutes
(`vercel.json`), protected by `Authorization: Bearer $CRON_SECRET` exactly
like the existing notification sweep; it also runs the Sell.Do retry sweep
in the same invocation (see `docs/selldo-integration.md`) rather than
requesting a second Vercel Cron slot. `POST /api/integrations/property-portals/olx/sync`
runs the identical sync logic on demand for ADMIN users only, rate-limited
per admin (`olxManualSync` in `src/lib/rate-limit.ts`).

### Normalization / matching / dedup

`src/integrations/olx/adapter.ts` parses OLX's `DD/MM/YY` lead date
unambiguously (with an explicit day/month rejection of impossible calendar
dates), normalizes `phoneNumber` via the existing `normalizeIndianPhone`
(handles a `+91` prefix), and infers locality/asset class/transaction
type/BHK from the ad's `parameters` bag - low-confidence inferences are
flagged via `needsReview`/`reviewReasons` on the event snapshot rather than
guessed silently. `adId` is passed as `externalListingId` and resolved to a
`Property` purely through `ingestPortalLead`'s existing `PortalListing`
matching (no OLX-specific matching code); an unmatched or ambiguous `adId`
never discards the lead - see Part E of the implementation notes below. When
OLX's response carries its own stable per-lead id it is used as
`externalLeadId`/`externalEventId`; otherwise a deterministic
`olx:<sha256>` hash of provider + adId + normalized phone + lead date is
derived (`deriveOlxEventId`), mirroring Housing's `deriveHousingEventId`.

### Unmatched-listing visibility

OLX lead events flow through the same `ExternalLeadEvent` table as every
other provider, so `UNKNOWN_LISTING`/`AMBIGUOUS_LISTING` outcomes are
recorded identically. The existing **Sync conflicts** admin page
(`/integrations/property-portals/conflicts`) surfaces `PortalListing` rows
with `status = SYNC_CONFLICT` (a *published-listing* snapshot mismatch) -
this is a different condition from a newly-arrived lead whose `adId` has no
matching `PortalListing` yet. There is currently no dedicated UI listing
those `ExternalLeadEvent` rows by `failureReason`; they remain queryable via
the database/audit trail. This is a known follow-up, not implemented in this
change (see the implementation report for full context).

## Provider matrix

| Provider | Webhook | Pull | Email | Listing API | Adapter | Production status |
| --- | --- | --- | --- | --- | --- | --- |
| Housing | Supported inbound | Unknown | Awaiting sample | Unknown | Existing normalizer | Connected webhook |
| OLX | Unknown | Implemented (mocked-HTTP tested only) | Awaiting sample | Unknown | Auth/fetch/adapter/sync built per endpoint contract | Awaiting live credentials |
| MagicBricks | Unknown | Unknown | Awaiting sample | Unknown | CRM-ready skeleton | Awaiting provider access |
| 99acres | Unknown | Unknown | Awaiting sample | Unknown | CRM-ready skeleton | Awaiting provider access |
| Meta | Unknown | Unknown | Unknown | Unknown | CRM-ready skeleton | Awaiting provider access |

## Adding a provider

Register the provider, add evidence-based capabilities, implement only documented adapter operations, configure credentials in approved server-side secret storage, map fields to `CanonicalPortalLead`, and add fixtures/tests. No core lead-pipeline changes should be necessary.

## Access checklist

For OLX, MagicBricks, and 99acres: official documentation, account/dealer identifier, authentication method, credentials, webhook or pull contract, listing/event identifiers, sandbox availability, and rate limits. For Meta: official Lead Ads app/webhook configuration and approved credentials. For email: sanitized message samples plus configured sender/domain rules.
