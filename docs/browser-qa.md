# Browser QA (Playwright)

Local, Chromium-only browser QA for the KP Properties CRM. This suite is
**local-only** by construction — a safety guard refuses to run against any
host other than `localhost`/`127.0.0.1` (`tests/e2e/helpers/safety-guard.ts`),
and refuses to run migrations/seeds against a non-local `DATABASE_URL`.

## Formerly-blocking defects (now fixed)

Three defects previously made authenticated browser QA impossible. All are
now fixed in application source or this framework - see git history for the
exact commits:

1. **Route conflict** (application source, fixed): `/api/catalogues/[id]`
   and `/api/catalogues/[token]` were sibling dynamic API routes with
   conflicting slug names, corrupting Next's route table badly enough that
   the entire NextAuth API surface 404'd. The public token routes now live
   under `/api/catalogues/public/[token]/...`.
2. **CSP blocked `next dev`'s Fast Refresh** (application source, fixed):
   `script-src` had no `unsafe-eval`, and Next's Fast Refresh runtime
   unconditionally `eval()`s module updates - unrelated to webpack
   `devtool`/source-maps. `src/lib/csp.ts` now adds `unsafe-eval` only when
   `NODE_ENV === "development"`; the CSP served by `next build`/`next
   start` is unchanged.
3. **`next dev`'s HMR WebSocket rejects `127.0.0.1`** (this framework,
   fixed): reproduced directly - identical login flow succeeds via
   `localhost:3100`, fails via `127.0.0.1:3100`, nothing else different.
   `playwright.config.ts` and `.env.qa` now default to `localhost`.

`next start` (production mode) remains blocked by the app's own (correct,
intentional) `src/lib/env.ts` guard refusing a non-`https://` `NEXTAUTH_URL`
in production - `next dev` stays the sanctioned local fallback, which is
why defects 2 and 3 needed fixing rather than switching away from dev mode.

Two more framework-only bugs were found and fixed while getting navigation
specs green: `waitForURL`'s default `waitUntil: "load"` never fires for
this app's client-side (`router.push`) route transitions - `auth.setup.ts`
and the new `tests/e2e/helpers/navigation.ts` now use `waitUntil: "commit"`.
And `next dev`'s on-demand-entries occasionally serves a corrupted JS chunk
under sustained rapid sequential navigation (never reproducible in
isolation) - `retries` is now `1` locally too, not just in CI.

## Prerequisites

- Docker Desktop running, with the repo's `docker-compose.yml` stack up
  (`docker compose up -d`) - gives you Postgres on `127.0.0.1:5434`.
- Chromium installed for Playwright: `npx playwright install chromium`.

## Fresh disposable QA database

Never point QA at your dev database. Create a separate, disposable
database on the same local Postgres server:

```bash
docker exec <postgres-container> psql -U crm -d delhi_broker_crm \
  -c "DROP DATABASE IF EXISTS delhi_broker_crm_qa;" \
  -c "CREATE DATABASE delhi_broker_crm_qa;"
```

Then apply the normal tracked migration chain - **never**
`prisma/ci/legacy-schema-bootstrap.sql`, and never hand-create
`saved_views`/`SavedViewEntityType`/`HOT_LEAD_NO_FOLLOWUP`:

```bash
DATABASE_URL=postgresql://crm:crm_dev_password@127.0.0.1:5434/delhi_broker_crm_qa \
DIRECT_URL=postgresql://crm:crm_dev_password@127.0.0.1:5434/delhi_broker_crm_qa \
  npx prisma migrate deploy
  npx prisma migrate status   # expect "Database schema is up to date!"
```

`.env.qa` (gitignored, not committed) holds this connection string plus
`WHATSAPP_PROVIDER=MOCK`, `STORAGE_PROVIDER=DISABLED`,
`MAPS_PROVIDER=DISABLED` - so no real WhatsApp/SMS/email send is even
reachable regardless of what a test does.

## Seed synthetic QA identities

```bash
npm run test:e2e:seed
```

Idempotent (upsert by email), refuses to run against a non-local
`DATABASE_URL`. Creates:

| Identity | Email | Password |
|---|---|---|
| QA Admin | qa.admin@example.test | `QaTest@12345` |
| QA Data Manager | qa.datamanager@example.test | `QaTest@12345` |
| QA Field Executive | qa.fe@example.test | `QaTest@12345` |
| QA Unassigned FE | qa.fe.unassigned@example.test | `QaTest@12345` |

No synthetic leads/properties/visits/catalogues are seeded yet (see
"Known gaps" below) - `tests/e2e/setup/seed-qa.ts` is the place to add them.

## Running the suite

```bash
npm run test:e2e            # headless, HTML report
npm run test:e2e:headed     # visible browser
npm run test:e2e:ui          # Playwright UI mode
npm run test:e2e:report      # open the last HTML report
```

`playwright.config.ts` starts the app itself via `npm run dev` (the
sanctioned local fallback - see "Formerly-blocking defects" above for why
not `next start`) against the QA database, and refuses to start at all if
the resolved `baseURL` isn't `localhost`/`127.0.0.1` or looks like
`crm.kpproperties.co.in`.

## GPS mocking

Playwright's `geolocation` context option + `permissions: ["geolocation"]`
grants deterministic synthetic coordinates to the local origin only - see
Phase 24 in the QA task for the full click-driven capture flow. Note also
that `next.config.ts` now sets `Permissions-Policy: geolocation=(self)`
(fixed from an empty `geolocation=()` allowlist, which blocked the Capture
Location feature for the app's own first-party pages too, not just third
parties) - the FIELD_EXECUTIVE Capture Location button is reachable, no
further header change is needed for GPS QA.

## Artifacts

- HTML report: `test-results/html-report/`
- Traces/screenshots/videos for failed tests: `test-results/artifacts/`
- Stored auth state: `tests/e2e/.auth/*.json` (gitignored)

## Debugging a failure

```bash
npx playwright show-report test-results/html-report
npx playwright show-trace test-results/artifacts/<test-name>/trace.zip
```

## Known gaps (not completed in this pass)

All three login-blocking defects above are now fixed, and role-based
navigation, the public-route privacy smoke test, and the responsive matrix
(4 breakpoints x dashboard/leads/properties/visits) all pass. Still not
built - none of this was blocked by anything, it simply wasn't reached yet:

- No synthetic leads/properties/visits/catalogues seeded -
  `tests/e2e/setup/seed-qa.ts` only creates the 4 identities so far.
- Matches, Client Response, Follow-up, Multi-property Visit, GPS capture
  (click-driven), Visit Outcome, Deal flow, the full field-level privacy
  audit (internalNotes/ownerPhone/GPS fields/etc. on a real synthetic
  property+catalogue), zero-auto-send network observation, accessibility,
  and the remaining 5 of 9 required responsive pages (Lead Workspace,
  Property Detail, Visit Detail, FE Visit Property, Public Catalogue) are
  all **NOT YET WRITTEN** - see the QA report's phase-by-phase table.
