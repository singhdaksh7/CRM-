# Delhi Broker CRM — MVP

A working CRM and property inventory platform for a Delhi real-estate brokerage: manage inventory, capture and match leads, share properties over WhatsApp, assign visits, track follow-ups, and monitor the business from an admin dashboard.

## Tech Stack

- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS 4**
- **SQLite** via **Prisma ORM** (schema is portable — see "Moving to PostgreSQL" below)
- **NextAuth v5** (Credentials provider, JWT sessions) for role-based auth
- **React Hook Form** + **Zod** for forms/validation
- **Recharts** for dashboard/report charts
- **sonner** for toasts

## Setup

```bash
npm install
cp .env.example .env          # defaults already work for local dev
npx prisma migrate deploy     # create prisma/dev.db and apply schema
npm run db:seed               # seed 30 properties, 25 leads, employees, visits, follow-ups
npm run dev
```

Open http://localhost:3000 — it redirects to `/login`.

> **Note on Turbopack:** `next dev`/`next build` are pinned to `--webpack` in `package.json`. Turbopack hung indefinitely on every request in this environment (confirmed down to a zero-dependency test route); webpack works reliably. If you're on a machine where Turbopack works fine, feel free to drop the flag.

### Demo Accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@delhibrokercrm.com` | `Admin@123` |
| Data Manager (Kanchan) | `kanchan@delhibrokercrm.com` | `Kanchan@123` |
| Field Executive (Sagar) | `sagar@delhibrokercrm.com` | `Sagar@123` |
| Field Executive (Mohit Bhai) | `mohit@delhibrokercrm.com` | `Employee@123` |
| Field Executive (Nonu Bhai) | `nonu@delhibrokercrm.com` | `Employee@123` |

### Useful scripts

```bash
npm run dev        # start dev server (webpack)
npm run build      # production build
npm run db:seed    # re-seed demo data (idempotent-ish: creates fresh IDs)
npm run db:reset   # drop, re-migrate, and re-seed the database
```

## Roles & Permissions

| Area | Admin | Data Manager | Field Executive |
|---|---|---|---|
| Dashboard | ✅ | ✅ (own scope) | ✅ (own scope) |
| Properties | ✅ | ✅ | — |
| Leads | ✅ (all) | ✅ (all) | ✅ (assigned only) |
| Matching & WhatsApp Sharing | ✅ | ✅ | — |
| Visits | ✅ | ✅ (schedule) | ✅ (assigned, update status/notes) |
| Follow-ups | ✅ | ✅ | ✅ (own) |
| Employees | ✅ | — | — |
| Reports | ✅ | — | — |
| Settings | ✅ | — | — |

Enforced in two places: `src/proxy.ts` (route-level redirect for pages a role can't see) and every `/api/*` route handler via `requireSession(roles)` in `src/lib/api-auth.ts`. Field executives are additionally row-scoped to their own leads/visits/follow-ups in both the API and page queries.

## Database Schema

See `prisma/schema.prisma` for the full model. Highlights:

- **User** — single table for all three roles (`Role` enum), used for both login and as the "Employee" record.
- **Property** — one model covers rent and sale (nullable pricing fields per listing type), with JSON-encoded `amenities`/`images` arrays (SQLite has no native array type — swap to Postgres `String[]` if you migrate).
- **Lead** — `externalLeadId` has a unique constraint, which is what makes webhook ingestion idempotent.
- **LeadTransfer**, **SharedPropertyLog**, **Visit**, **FollowUp**, **Activity** — one row per event, all foreign-keyed to `Lead`, giving the full timeline seen on a lead's Activity tab for free.

### Moving to PostgreSQL

The models don't use any SQLite-only types. To migrate:
1. Set `provider = "postgresql"` in `prisma/schema.prisma`'s `datasource` block.
2. Point `DATABASE_URL` at your Postgres instance.
3. Run `npx prisma migrate dev`.
4. Optionally convert `amenities`/`images` from JSON-string columns to native `String[]` — not required, just cleaner on Postgres.

## Property Matching Logic

`src/lib/matching.ts` scores every `AVAILABLE` property of the correct listing type (rent/sale) against a lead's requirement on six weighted dimensions:

| Dimension | Weight | Logic |
|---|---|---|
| Location | 25 | Lead's preferred area matches the property's area/address (substring match) |
| Budget | 30 | Full score within budget; scaled down linearly as the price approaches the tolerance ceiling |
| BHK | 20 | Full score on exact match, half score if off by one |
| Furnishing | 10 | Full score on exact match, partial credit otherwise |
| Availability | 8 | Property's `availableFrom` is on/before the lead's `moveInDate` |
| Property Type | 7 | Currently always awarded (placeholder for a future type-preference field) |

**Budget tolerance** is a request-time parameter (`?tolerance=0|0.1|0.2`, exposed as a dropdown on the matching screen): a property priced above the lead's max budget is still shown — and clearly labeled "Up to 10%/20% above budget" — as long as it's within tolerance; anything beyond that is filtered out entirely. Properties are sorted by score descending. The UI shows per-dimension match/mismatch reasons (`reasons[]`) so a data manager can see *why* something scored the way it did, not just the number.

## Phase 2A — Automation Layer

Added on top of the Phase 1 MVP, additive-only (see migration `20260801123833_phase2a_organization_and_scoping`):

- **Organization foundation** — every major table carries `organizationId` (default `org_default`), preparing for multi-tenant SaaS without another migration.
- **Automatic Lead Assignment** (`src/lib/assignment.ts`) — configurable rules (Round Robin, Lowest Workload, Location-Based, Speciality, Manual-Only) evaluated in priority order in Settings → Automatic Lead Assignment; each employee has capacity/speciality/service-areas/availability. "Run Auto Assignment" exists per-lead and in bulk on the Leads page.
- **Lead Scoring** (`src/lib/scoring.ts`) — deterministic 0–100 weighted engine mapping to Hot/Warm/Cold, recalculated on creation/edit/status change/visit/share (and, as of Phase 2B, WhatsApp replies and catalogue engagement — see below). Full factor breakdown shown on the lead detail page.
- **Notification Centre** (`src/lib/notifications.ts`) — header dropdown + `/notifications` page; due/overdue follow-up notifications are generated by an idempotent lazy sweep on every authenticated page load (swap-in-ready for a real cron worker).

## WhatsApp Sharing (legacy quick-share flow)

`src/lib/whatsapp.ts` defines a small `WhatsAppAdapter` interface with two implementations:

- **`MockWhatsAppAdapter`** (default, `WHATSAPP_API_MODE=mock`) — builds a `https://wa.me/<phone>?text=<message>` click-to-chat link. No credentials needed; opens the user's own WhatsApp.
- **`CloudApiWhatsAppAdapter`** (`WHATSAPP_API_MODE=live`) — posts to the real WhatsApp Business Cloud API (`graph.facebook.com/.../messages`) using `WHATSAPP_CLOUD_API_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID`.

Every share is logged in `SharedPropertyLog` (properties included, message text, who shared, timestamp, the generated link) and appears in the lead's "Shared" tab and Activity timeline. Switching to live WhatsApp is a one-line env var change — no calling code changes.

The public property page (`/p/[id]`) is unauthenticated by design (see `src/proxy.ts`'s public-path allowlist) and deliberately omits `ownerName`/`ownerPhone`/`ownerNotes`.

## Mock Lead Ingestion (99acres / Magicbricks)

```
POST /api/integrations/leads/99acres
POST /api/integrations/leads/magicbricks
```

Both accept the same payload shape (validated with Zod in `src/lib/validators.ts`):

```json
{
  "externalLeadId": "99A-10054",
  "clientName": "Rahul Sharma",
  "phone": "+919876543210",
  "email": "rahul@example.com",
  "requirementType": "RENT",
  "location": "Janakpuri",
  "minimumBudget": 18000,
  "maximumBudget": 22000,
  "bhk": 2,
  "furnishing": "SEMI_FURNISHED",
  "source": "99ACRES",
  "notes": "Needs property near metro station"
}
```

Pipeline: validate → reject duplicates by `externalLeadId` (409) → create the lead as `NEW` → log a `LEAD_RECEIVED` activity. Matching then happens on-demand when a data manager opens the lead's Match & Share screen (rather than pre-computing matches for every lead on ingestion, which would waste work for leads that go stale).

**Connecting the real APIs later:** once 99acres/Magicbricks issue API credentials, replace the body of these two route handlers with a call to the real webhook signature verification + payload shape, keeping the same "validate → dedupe → create → activity" pipeline. No schema or UI changes needed.

## Phase 2B — WhatsApp Conversations & Property Catalogues

### WhatsApp Provider Architecture (`src/integrations/whatsapp/`)

A provider-agnostic layer completely separate from the legacy `src/lib/whatsapp.ts` adapter above. Set `WHATSAPP_PROVIDER` to switch:

| Provider | Credentials needed | Behaviour |
|---|---|---|
| `MOCK` (default) | none | Makes zero network calls. Sends resolve instantly to `SENT`. Delivered/Read/Failed transitions and inbound replies are driven entirely by the "Demo Controls" in the lead's WhatsApp tab. |
| `CLICK_TO_CHAT` | none | Builds a real `wa.me` link. Sends resolve to `QUEUED`, **never** auto-promoted to `SENT` — the UI calls `POST .../messages/[id]/mark-opened` only after the human actually opens the link (an explicit application-side action, not a provider confirmation). Never reports `DELIVERED`/`READ` — WhatsApp gives click-to-chat integrations no delivery receipts. |
| `META_CLOUD` | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN` (+ optional `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_APP_SECRET`) | Full Cloud API request construction, 10s timeout, error parsing, webhook GET-verification handshake, POST payload parsing, and HMAC-SHA256 signature verification (`whatsapp-signature.ts`) are all implemented. **This has not been exercised against a live Meta account in this environment** — no real credentials were available to test with. Wiring up a real account requires only setting the env vars; no code changes. |

`loadWhatsAppConfig()` throws a clear `WhatsAppConfigError` if `META_CLOUD` is selected without complete credentials, rather than failing silently or falling back. Access tokens/app secrets are read only in `src/integrations/whatsapp/*` and `src/lib/*` server modules — never exported with a `NEXT_PUBLIC_` prefix, never sent to the browser, and the Settings page only ever shows "Configured"/"Missing", never the values.

### Conversations

Every lead can have a `WhatsAppConversation` (unique per lead+phone number). Message history is a normal Prisma-backed thread (`WhatsAppMessage`) with `direction` (INBOUND/OUTBOUND), `status` (QUEUED → SENT → DELIVERED → READ, or FAILED), timestamps for each transition, and `errorMessage` for failures. The lead workspace's **WhatsApp tab** shows bubbles, per-message status icons, a composer, a Retry action on failed messages, and — mock mode only — inline Simulate Delivered/Read/Failed buttons plus a "Simulate Client Reply" control with canned realistic replies.

An inbound reply (simulated or, eventually, real via the Meta webhook) always runs the same pipeline: save the message → log a lead activity → notify the assigned employee → recalculate the lead score (`recalculateLeadScore` now also weighs WhatsApp/catalogue engagement — see `src/lib/scoring.ts`). It never overwrites lead requirement fields based on message text (that's explicitly deferred — see Known Limitations).

### Property Catalogues — relationship to `SharedPropertyLog`

`SharedPropertyLog` (Phase 1) and `CatalogueShare` (Phase 2B) are **not** two independent systems: creating a catalogue is a separate step (build → preview → send), and **sending** it always also writes a `SharedPropertyLog` row with the same properties/message, so the lead's existing "Shared" tab keeps showing every share — old quick-shares and new catalogues — in one place. `CatalogueShare` is the richer, additional layer: a secure public link, per-property visibility controls, view/interaction tracking, and expiry/revocation, none of which `SharedPropertyLog` ever had.

Build one from a lead's **Catalogues tab** → "Build New Catalogue": select from the existing match results, reorder with up/down controls (no drag-and-drop dependency added), add a per-property note, toggle price/address/brokerage visibility, set an optional expiry, then create. The public link (`/share/catalogue/[token]`) needs no login. The token is `crypto.randomBytes(24)` base64url — 192 bits of entropy, never derived from any database ID.

The public page never serializes a Prisma record directly — everything goes through `toPublicCatalogueDTO()` (`src/lib/catalogues.ts`), which omits owner name/phone/notes, internal commission (unless `includeBrokerage` is on), lead phone/email, and organization IDs, and clearly labels properties that became unavailable after the catalogue was created (rented/sold/inactive elsewhere).

Client actions on the public page (Interested / Not Interested / Request Visit / Ask a Question / Open in Maps / Call / WhatsApp) all hit `POST /api/catalogues/[token]/interactions`, which — per action — logs a lead activity, notifies the assigned employee, and (for Interested/Visit Requested) recalculates the lead score. A visit request creates a `FollowUp` (type `VISIT_CONFIRMATION`, due within 24h) but deliberately does **not** auto-create a confirmed `Visit` — a human still schedules that. Page views are deduped per visitor via an httpOnly cookie + a 30-minute window, so a refresh never inflates the view counter or re-notifies the employee; only the very first view ever notifies anyone.

### Webhook Idempotency

`IntegrationWebhookEvent` (unique on `provider` + `externalEventId`) backs the Meta webhook route (`/api/integrations/whatsapp/webhook`). Every inbound message and every status update is recorded there before processing; a duplicate delivery (Meta retries webhooks) hits the unique constraint, is treated as already-handled, and is skipped — this was verified with a real duplicate-POST test, not just written and assumed (see Verification section in the completion report).

## API Overview

All routes below live under `src/app/api/` and are protected by `requireSession()` (see `src/lib/api-auth.ts`) except the two integration webhooks, the public catalogue routes, and NextAuth's own routes.

| Route | Methods | Notes |
|---|---|---|
| `/api/properties` | GET, POST | list w/ filters, create |
| `/api/properties/[id]` | GET, PATCH, DELETE | DELETE soft-deactivates (`status: INACTIVE`) |
| `/api/leads` | GET, POST | list w/ filters, create (field execs auto-scoped to their own) |
| `/api/leads/[id]` | GET, PATCH | |
| `/api/leads/[id]/assign` | POST | |
| `/api/leads/[id]/transfer` | POST | logs a `LeadTransfer` row + activity |
| `/api/leads/[id]/notes` | POST | appends a timestamped note |
| `/api/leads/[id]/match` | GET | runs the matching engine, `?tolerance=` |
| `/api/leads/[id]/share` | GET, POST | GET = history, POST = share + log + activity |
| `/api/employees` | GET, POST | |
| `/api/employees/[id]` | GET, PATCH | |
| `/api/visits` | GET, POST | |
| `/api/visits/[id]` | PATCH | |
| `/api/follow-ups` | GET, POST | `?bucket=overdue\|today\|upcoming` |
| `/api/follow-ups/[id]` | PATCH | |
| `/api/activities` | GET | `?leadId=` |
| `/api/dashboard` | GET | same aggregation the Dashboard page uses |
| `/api/reports` | GET | admin-only |
| `/api/integrations/leads/99acres` | POST | mock webhook, public |
| `/api/integrations/leads/magicbricks` | POST | mock webhook, public |
| `/api/assignment-rules` | GET, POST | admin-only |
| `/api/assignment-rules/[id]` | PATCH, DELETE | admin-only |
| `/api/leads/[id]/auto-assign` | POST | |
| `/api/leads/bulk-auto-assign` | POST | bulk-assigns all unassigned leads, or an explicit `leadIds` list |
| `/api/leads/[id]/recalculate-score` | POST | |
| `/api/notifications` | GET | `?type=`, `?unreadOnly=true`; also runs the due-follow-up sweep |
| `/api/notifications/[id]/read` | POST | |
| `/api/notifications/mark-all-read` | POST | |
| `/api/leads/[id]/whatsapp` | GET | conversation + message history |
| `/api/leads/[id]/whatsapp/conversation` | POST | find-or-create |
| `/api/leads/[id]/whatsapp/messages` | POST | send text/template |
| `/api/leads/[id]/whatsapp/messages/[messageId]/retry` | POST | re-sends a `FAILED` message |
| `/api/leads/[id]/whatsapp/messages/[messageId]/mark-opened` | POST | click-to-chat QUEUED → SENT (app-side action, not in the original spec list — added to fill a gap the click-to-chat status policy requires) |
| `/api/leads/[id]/whatsapp/simulate-reply` | POST | mock-mode only |
| `/api/leads/[id]/whatsapp/simulate-status` | POST | mock-mode only |
| `/api/leads/[id]/catalogues` | GET, POST | create restricted to Admin/Data Manager |
| `/api/leads/[id]/catalogues/[catalogueId]` | GET, PATCH | GET includes a rendered message preview |
| `/api/leads/[id]/catalogues/[catalogueId]/send` | POST | Field Executives may send an existing catalogue |
| `/api/leads/[id]/catalogues/[catalogueId]/revoke` | POST | Admin/Data Manager only |
| `/api/catalogues/[token]` | GET | public, returns the public-safe DTO only |
| `/api/catalogues/[token]/view` | POST | public, deduped per viewer/time-window |
| `/api/catalogues/[token]/interactions` | POST | public |
| `/api/integrations/whatsapp/webhook` | GET, POST | Meta verification handshake + inbound events, public, idempotent |

## Completed Features

- Full property inventory CRUD with all fields from the spec (location, pricing for rent *and* sale, details, media, private owner info), search/filter/sort, card & table views
- Lead management: manual entry, mock webhook ingestion, assignment, transfer (with history), notes, status/priority updates, full filter set
- Property matching engine with configurable budget tolerance, weighted score, and human-readable match/mismatch reasons
- WhatsApp sharing workflow: select properties → preview/edit message → click-to-chat → logged to lead history → public no-login property page
- Employee management with workload/performance counts and activate/deactivate
- Visit management: today/upcoming/all/employee-wise views, status + outcome updates
- Follow-up management with overdue/today/upcoming buckets and completion tracking
- Full activity timeline per lead
- Admin dashboard: 8 KPIs, 5 charts (source, status, location, employee performance, monthly trend), recent activity feed
- Reports: conversion rate, employee performance table, source/location/budget/rent-vs-sale breakdowns
- Role-based auth (Admin / Data Manager / Field Executive) enforced at both route and API level
- Seed data: 5 users, 30 properties, 25 leads, 10 visits, 15 follow-ups, activity history
- **Phase 2A**: organization foundation, automatic lead assignment (5 strategies), lead scoring (0–100, Hot/Warm/Cold), Notification Centre
- **Phase 2B**: provider-agnostic WhatsApp architecture (Mock/Click-to-Chat/Meta Cloud), persistent per-lead conversations with delivery-status tracking, property catalogue builder with a secure public link, public catalogue interactions (view dedup, Interested/Not Interested/Visit Request/Question), webhook idempotency

## Phase 2 (remaining items intentionally out of scope for this MVP)

- Real 99acres / Magicbricks API integration (currently mocked per the brief)
- The Meta Cloud WhatsApp provider is structurally complete but **untested against a live Meta account** — no real credentials were available in this environment
- Cloudinary/S3-backed image upload (currently a URL field — structured so a real upload widget slots in without touching the schema)
- Full drag-and-drop calendar grid for visits (current implementation is a grouped list view: today/upcoming/all/employee-wise)
- Persisted, editable Settings beyond WhatsApp/assignment-rule status (company profile fields are still read-only)
- Owners, Deals, Payments, Documents, Maps/locality intelligence, AI requirement extraction, mobile `/field` workspace, full multi-tenant billing (all deferred to later phases per the phased plan)
- SMS / calling integrations
- Requirement fields are never auto-updated from WhatsApp message text (by design, to avoid silently overwriting client data on a guess)
