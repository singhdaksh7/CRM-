# Sell.Do lead sync

## Overview

Every OLX lead that lands as a **new** CRM `Lead` (via `ingestPortalLead`) is
forwarded to Sell.Do, best-effort, asynchronously to CRM lead creation. Sell.Do
unavailability, misconfiguration, or any API/network failure **never** rolls
back, deletes, or blocks creation of the CRM lead - the CRM remains the
operational system of record regardless of Sell.Do's state.

**A Sell.Do API key was previously shared with this project outside of source
control and is treated as compromised/needing rotation. Its real value does
not appear anywhere in this repository - only the env var *names* below are
referenced, read at call time, and never logged.**

## Environment variables (names only)

- `SELLDO_API_KEY` - server-only, read only in `src/integrations/selldo/config.ts`.
- `SELLDO_SRD` - the campaign SRD value; never hardcoded anywhere, only read from this env var at call time.
- `SELLDO_API_BASE_URL` *(added, optional)* - overrides the default Sell.Do API host. No base host was given in the task beyond the relative path `/api/leads/create`; this exists so a sandbox/alternate host can be configured without a code change. Defaults to a conventional Sell.Do API host if unset.

## Request shape

`src/integrations/selldo/client.ts` builds a form-encoded POST via
`URLSearchParams` (never hand-concatenated) with the documented fields:

- `sell_do[form][lead][name]`, `sell_do[form][lead][email]` (omitted if the lead has none), `sell_do[form][lead][phone]`
- `sell_do[campaign][srd]` - **only ever sourced from `process.env.SELLDO_SRD`**
- `sell_do[campaign][name]` = `"OLX Lead Generation"`, `sell_do[campaign][source]` = `"OLX"`, `sell_do[campaign][sub_source]` = `"OLX Dealer API"`, `sell_do[campaign][project]` = `"KP Properties"` - fixed constants per the task, never derived from request input
- `sell_do[form][content][note]` - e.g. `"Lead received from OLX Dealer API. OLX Ad ID: <id>. CRM Lead ID: <id>."` - never GPS, exact address, internal notes, credentials, or tokens

**Assumption flag**: no full Sell.Do API document was supplied - the
campaign/source/sub-source/project field *names* above and the `secret_key`
query-parameter auth convention are a reasonable best guess based on Sell.Do's
commonly documented lead-capture pattern, not a verified contract. If the real
integration doc differs, `client.ts` is the only file that needs to change.

## Sync / retry / outbox behavior

Built on the existing `PortalOperation` ledger - no new table:

- `operationType`: `"SELLDO_LEAD_SYNC"`, one row per CRM lead.
- `idempotencyKey`: `selldo-lead-sync:<leadId>` - a retry (inline or cron) can never double-submit the same lead; an operation already `SUCCEEDED` or `DEAD_LETTER` is never re-attempted.
- States: `PENDING` (row just created) -> `SUCCEEDED`, or `RETRYABLE` (with `retryEligibleAt` exponential backoff: 5m, 15m, 60m, 240m, capped at 24h) after a failed attempt, escalating to `DEAD_LETTER` once `attemptCount` reaches 5.
- A missing `SELLDO_API_KEY` or `SELLDO_SRD` is handled gracefully - never a crash - and recorded as `RETRYABLE` with a 24h backoff so it doesn't spam retries while an operator finishes configuration; it self-heals once the env vars are set.
- Triggered inline, best-effort, immediately after a NEW OLX-originated lead is created (mirrors how `ingestPortalLead` already calls `autoAssignLead`), and again from the retry sweep folded into the `/api/internal/olx/sync` cron (every 30 minutes) for any `RETRYABLE` row past its `retryEligibleAt`.

## Operational troubleshooting

- **Nothing syncing at all**: check the OLX/Sell.Do admin panel status block (`/integrations/property-portals`, ADMIN-only) for `SELLDO_API_KEY configured` / `SRD configured` presence flags (values are never shown).
- **Pending/retryable count climbing**: query `PortalOperation` where `operationType = "SELLDO_LEAD_SYNC"` and `status IN ("PENDING", "RETRYABLE")` - `failureReason` on each row explains the last failure (API status code, network error class, or missing-config).
- **Dead-lettered leads**: `status = "DEAD_LETTER"` rows exhausted their retry budget; the CRM `Lead` itself is unaffected and remains fully usable - a dead-lettered row is a Sell.Do-sync gap only, not a data-loss event.
- **Never** expect to find the Sell.Do API key or SRD value anywhere in logs, the UI, or the `PortalOperation` table - only presence/absence and sanitized failure summaries are ever recorded.
