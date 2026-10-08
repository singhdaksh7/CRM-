# Testing

Three layers. Everything runs locally against fake data. No test should ever touch production, and the E2E suite refuses to start if it would.

| Layer | Tool | Where | Needs DB? |
|---|---|---|---|
| Unit / route-handler tests | Vitest | co-located `*.test.ts` in `src/` and `scripts/` | No (Prisma and auth are mocked) |
| "Integration" tests | Vitest | route tests such as `src/app/api/**/route.test.ts`, `*-org-isolation.test.ts`, webhook tests | No: they call route handlers directly with mocked collaborators |
| End-to-end browser tests | Playwright (Chromium) | `tests/e2e/**` | **Yes**, a separate disposable QA database and a running dev server |

## Unit and route tests (Vitest)

```bash
npm test                         # = vitest run, whole suite
npx vitest run src/lib/visits.test.ts          # one file
npx vitest run -t "VISIT_REQUIRED"             # by test name
npx vitest                       # watch mode
```

State at time of writing: **283 files, 3043 tests, all passing** (about 30 s). Config: `vitest.config.ts` (node environment; `@` alias; `server-only` stubbed by `src/test/stubs/server-only.ts`). A harmless warning about the Vite config being loaded as CommonJS is expected.

Other gates, same as CI:

```bash
npx tsc --noEmit        # typecheck: clean
npm run lint            # eslint: 0 errors (about 59 existing warnings)
npm run build           # next build --webpack
```

## Playwright E2E

Local-only by design:

- `playwright.config.ts` loads `.env.qa` (or the file named by `E2E_ENV_FILE`), calls `assertSafeBaseUrl()` and, in `globalSetup`, `assertSafeDatabaseUrl()`. It **throws** if the URL host isn't `localhost`/`127.0.0.1`, looks like `kpproperties.co.in`, or the database host isn't local.
- It starts its own dev server (`npm run dev -- -p 3100`) because `next start` correctly refuses an `http://` `NEXTAUTH_URL`, and reuses one already on port 3100.
- Projects: `setup` (logs in each role and stores auth state), `admin`, `data-manager`, `field-executive`, `public`, `responsive`. Single worker, 1 retry, 30 s test timeout.

### QA database setup (one time, and whenever you want a clean slate)

Use a database **separate from your dev database** on the same local Postgres container:

```bash
docker compose up -d
docker compose exec postgres psql -U crm -d postgres \
  -c "DROP DATABASE IF EXISTS delhi_broker_crm_qa;" \
  -c "CREATE DATABASE delhi_broker_crm_qa;"
```

Create `.env.qa` as described in [ENVIRONMENT.md](ENVIRONMENT.md) (it is gitignored), **including `REDIS_URL=""`**. Then load it for the CLI commands and apply the tracked migrations:

```bash
set -a; source .env.qa; set +a
npx prisma migrate deploy
npx prisma migrate status          # "Database schema is up to date!"
```

Never use `prisma/ci/legacy-schema-bootstrap.sql` or hand-create tables.

### Seed the synthetic QA data

```bash
npm run test:e2e:seed              # 4 identities (idempotent, refuses non-local DB)
```

Identities (password `QaTest@12345`): `qa.admin@example.test`, `qa.datamanager@example.test`, `qa.fe@example.test`, `qa.fe.unassigned@example.test`.

Many specs also need workflow data (leads, properties, catalogues, a visit, a deal). Those seeds call the real application API, so **the dev server must be running** (start it in another terminal with the QA env loaded):

```bash
# terminal 1
set -a; source .env.qa; set +a
npm run dev -- -p 3100

# terminal 2
set -a; source .env.qa; set +a
npx tsx tests/e2e/setup/seed-qa-workflow.ts
npx tsx tests/e2e/setup/seed-qa-release-candidate.ts
```

(`package.json` only has a script for the first seed; these two are run directly with `tsx`.)

### Run

```bash
npx playwright install chromium    # first time only
npm run test:e2e                   # headless; HTML report in test-results/html-report
npm run test:e2e:headed
npm run test:e2e:ui
npm run test:e2e:report
npx playwright test tests/e2e/admin/visit-required-flow.spec.ts     # one spec
```

Specs create their own rows tagged with a per-run id (for example `QA1RK<run>`), mock the network where relevant (`tests/e2e/fixtures/network-guard.ts`) and never reach a customer. `WHATSAPP_PROVIDER=MOCK`, `STORAGE_PROVIDER=DISABLED`, `MAPS_PROVIDER=DISABLED` in `.env.qa` mean no real send is even reachable.

## Recent regression coverage

| Area | Unit / route tests | E2E |
|---|---|---|
| **1 RK** (`bhk=0` labels, filters, matching, WhatsApp copy) | `src/lib/residential-configuration.test.ts`, `property-categories.test.ts`, `property-list-filters.test.ts`, `properties-page-bhk-filter.test.ts`, `catalogue-specs.test.ts`, `src/integrations/whatsapp/whatsapp-template-renderer.test.ts` | `tests/e2e/admin/one-rk-olx-visit-sync.spec.ts` |
| **OLX** lead source | `src/integrations/property-portals/*.test.ts`, lead validators | same spec (form/filter) |
| **Visit Completed requires a visit** | `src/app/api/leads/[id]/leads-id-route-visit-required.test.ts`, `src/lib/manual-lead-visit-completion.test.ts` | `tests/e2e/admin/visit-required-flow.spec.ts` |
| **Log completed visit** (transactional) | `src/lib/log-completed-visit.test.ts`, `src/app/api/leads/[id]/completed-visit/completed-visit-route.test.ts` | `visit-required-flow.spec.ts` |
| **Completed tab** | `completedVisitsWhere` in `src/lib/manual-lead-visit-completion.test.ts` | `visit-required-flow.spec.ts` (appears under Visits → Completed) |
| **Commercial vs residential separation** | `commercial-matching.test.ts`, `matching-business-lines.test.ts`, `commercial-property-validation.test.ts`, `catalogue-dto-commercial.test.ts`, `properties-route-commercial-filters.test.ts`, `requirements-route-commercial.test.ts`, `inventory-import-commercial.test.ts` | `one-rk-olx-visit-sync.spec.ts` ("commercial bhk=0 never renders as 1 RK") |

## Known Playwright results

This section is separate on purpose so you do not assume you broke something. It records one clean, single-run execution of the full suite on 2026-10-08 against `main` at commit `f36c686` (this branch only adds documentation, so the code is identical), on a Windows machine, with a freshly created QA database, the three seed steps above, `REDIS_URL=""`, and Playwright's default 1 retry:

> **105 tests: 97 passed, 5 failed, 3 flaky (failed first attempt, passed on retry). About 12 minutes.**

**Failed (deterministic, pre-existing, none related to 1 RK / OLX / Visit Completed):**

| Spec | Failure | Likely cause |
|---|---|---|
| `admin/accessibility-smoke.spec.ts:125` mobile menu keyboard | `getByRole('link', {name:'Leads', exact:true})` matches **2** elements (sidebar link and bottom-bar link): strict-mode violation | Stale selector: the mobile layout now renders both |
| `responsive/core-pages.spec.ts:27` mobile navigation opens | Same duplicate "Leads" link | Same stale selector |
| `admin/navigation.spec.ts:27` secondary nav "More / Administration" | Text "More" not found | Test predates the simplified navigation (`src/lib/permissions.ts` comments describe the trim); the expectation is out of date |
| `admin/next-action.spec.ts:20` "Liked, No Visit Planned → Schedule Visit" | Heading level 4 "Schedule Visit" not found | Next-action card wording/markup changed or the seeded lead state differs; not root-caused |
| `data-manager/navigation.spec.ts:14` primary nav | `waitForURL` timed out after clicking a nav link (20 s) | Not root-caused; may be dev-server compile latency on a slow machine, or a nav item that is now hidden for the role |

**Flaky (passed on retry):** `admin/follow-up.spec.ts:20`, `admin/one-rk-olx-visit-sync.spec.ts:182` (responsive overflow), `field-executive/gps-capture.spec.ts:34`. These are typical of `next dev` compiling pages on demand under a single worker (the config comment on `retries` describes the same effect).

How to read this: if your run shows these same specs failing, that is the baseline, not your change. A failure **outside** this list, or in the three feature specs (`one-rk-olx-visit-sync`, `visit-required-flow`, `visit-outcome`), is worth investigating. Results vary with machine speed, so re-run a failing spec on its own first:

```bash
npx playwright test tests/e2e/admin/navigation.spec.ts --project=admin
```

Two environment traps that look like product bugs: (1) a `REDIS_URL` leaking from your dev `.env` into QA makes the workflow seed fail with HTTP 429 and then many public-catalogue and workflow specs fail for lack of data; (2) running two Playwright/dev-server instances on port 3100 at once corrupts both runs. Fixing the stale selectors is a good first task.

## Writing tests

- Put a `*.test.ts` next to the code. Mock `@/lib/prisma` and `@/lib/auth`/`requireSession` as neighbouring tests do.
- A bug fix gets a failing-first regression test.
- For tenant-sensitive code add an org-isolation test (two orgs, assert no cross-read).
- For auth-sensitive routes assert 401 (signed out), 403 (wrong role) and the field-executive scoping.
- E2E data must be uniquely tagged and created in the QA database only.

Next: [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md).
