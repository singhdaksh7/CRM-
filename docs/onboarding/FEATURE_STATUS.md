# Feature Status

Legend: **Live** = in production use and covered by tests. **Implemented** = code and tests complete but its production use or data is unconfirmed. **Partial** = deliberately incomplete. **Integration-dependent** = code exists but needs an external account/contract/secret to do real work (works in mock/disabled mode locally). **Retired** = intentionally switched off.

Status reflects what the code and repository documents show; "Live" means the module is part of the deployed `main`, not that every sub-feature has been used by staff. Ask the owner when it matters.

| Area | Status | Main location | Notes |
|---|---|---|---|
| Authentication (credentials, sessions) | Live | `src/lib/auth.ts`, `src/proxy.ts` | JWT sessions, per-request revalidation, rate-limited login (needs Redis to enforce) |
| Roles / permissions | Live | `src/lib/permissions.ts`, `api-auth.ts` | Admin / Data Manager / Field Executive |
| Account setup & password reset | Live | `src/lib/account-setup.ts`, `password-reset.ts` | Links are generated for an admin to hand over; no email sending |
| Organization (tenant) scoping | Live | `src/lib/organization.ts` | Single org in use; multi-tenant plumbing present |
| Leads (CRUD, notes, phones, filters, bulk, export) | Live | `src/app/(app)/leads`, `api/leads` | OLX source supported |
| Lead status pipeline | Live | `api/leads/[id]/route.ts` | Visit Completed requires a visit |
| Visit Completed / "No visit on record" flow | Live | `lib/visits.ts`, `log-completed-visit-dialog.tsx` | Latest feature on `main` |
| Lead requirements (residential + commercial) | Live | `components/leads/lead-requirements-panel.tsx` | Multi-locality, multi-BHK |
| Properties / inventory (residential + commercial) | Live | `src/app/(app)/properties` | 1 RK = `bhk 0`; commercial separate |
| Property import (spreadsheet) with rollback | Implemented | `lib/inventory-import-*.ts` | Admin/Data Manager; rollback Admin |
| Localities & aliases | Live | `lib/property-locality.ts` | Normalised dictionary |
| Property images | Integration-dependent | `lib/property-images.ts`, `storage-providers/` | Needs R2/S3; `DISABLED` locally |
| Documents vault | Integration-dependent | `lib/documents.ts`, `document-access.ts` | Needs storage; category-based access |
| Property matching (lead ↔ property) | Live | `lib/matching.ts` | Scored with reasons; budget tolerance |
| Lead scoring (Hot/Warm/Cold) | Live | `lib/scoring.ts` | Recalculated on events |
| Auto-assignment | Live | `lib/assignment.ts` | 5 strategies, rule priority |
| Visits (multi-property, GPS, feedback) | Live | `lib/visits.ts` | Reschedule/cancel/conflicts |
| Completed Visits tab | Live | `(app)/visits/page.tsx` | `completedVisitsWhere` |
| Follow-ups | Live | `(app)/follow-ups`, `api/follow-ups` | Admin + Data Manager nav |
| Notifications | Live | `lib/notifications.ts` | In-app only; nightly sweep |
| Activity timeline & audit log | Live | `lib/activity.ts`, `audit.ts` | Audit redacts sensitive keys |
| Dashboards (admin / manager / executive / owner) | Live | `lib/*dashboard*-data.ts` | Redis cache optional |
| Reports (activity, brokerage, employees, localities, lost deals, portals, builder) | Live | `(app)/reports/**` | Admin only |
| Global search | Live | `lib/search/` | |
| Nearby properties | Live | `lib/nearby-properties.ts` | Uses stored GPS; no maps key needed |
| Catalogues + public share page | Live | `lib/catalogues.ts`, `app/share/catalogue` | Whitelist DTO; view/interaction tracking |
| WhatsApp (mock / click-to-chat) | Live | `integrations/whatsapp/` | Production is employee-click; no auto-send |
| WhatsApp Cloud API (`META_CLOUD`) | Integration-dependent | `meta-whatsapp-provider.ts` | Implemented; needs Meta account, secrets and approved templates |
| WhatsApp inbox | Implemented | `(app)/whatsapp`, `api/whatsapp/inbox` | Admin only; depends on Meta webhook for real inbound |
| 99acres lead webhook | Integration-dependent | `api/integrations/99acres/leads` | Built and secret-gated; awaiting/confirming first real payloads |
| Housing.com webhook + file import | Live | `integrations/housing/` | |
| OLX / MagicBricks / Meta / Square Connect portals | Integration-dependent | `integrations/property-portals/` | Skeleton adapters "awaiting provider access"; OLX/MagicBricks usable as lead *sources* |
| Portal connections, listings, conflicts, retries | Implemented | `(app)/integrations/property-portals` | Admin |
| Maps / geocoding | Integration-dependent | `integrations/maps/` | Google; `DISABLED` default |
| Owners, inventory partners | Live | `lib/owners.ts`, `inventory-partners.ts` | |
| Deals, offers, brokerage, payments | Implemented | `lib/deals.ts`, `brokerage*.ts`, `payments*.ts` | Admin / Data Manager |
| Automation rules | Implemented | `lib/automation-rules.ts` | Assign / follow-up / notify actions only; never messages customers |
| Saved views | Implemented | `api/saved-views` | |
| Property issues queue / availability reports | Implemented | `(app)/admin/property-issues` | |
| Settings / system config | Live | `(app)/settings` | Admin |
| Backups (metadata + restore validation) | Partial | `api/backups` | Real backups are done by host cron + scripts, not by the app |
| PWA / offline shell | Implemented | `public/sw.js`, `app/manifest.ts` | |
| Email notifications | Not implemented | n/a | `SMTP_*` unused |
| Customers / "Demand Pool" | Retired | `lib/retired-demand-pool.ts` | `/customers` → `/leads`; APIs return 410; legacy tables remain |
| Demo seed | Implemented | `scripts/seed-demo.ts` | Local only |
| Unit tests (Vitest) | Live | 283 files, 3043 tests | All pass at time of writing |
| Playwright E2E | Implemented | `tests/e2e/` | Local-only; see [TESTING.md](TESTING.md) for current pass/fail state |
| CI | Live | `.github/workflows/ci.yml` | Validate, typecheck, lint, test, build; no deploy |
| Production deployment | Live | `deploy/`, `docker-compose.prod.yml` | Docker on VPS behind Traefik; owner-run |
