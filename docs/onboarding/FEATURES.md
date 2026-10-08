# Feature Map

For each feature: where the UI lives, the API routes, the logic, and the data. Paths are under `src/` unless noted. Pages are in `src/app/(app)/…`; API routes in `src/app/api/…`. See [CODE_MAP.md](CODE_MAP.md) for tests and finer detail, and [FEATURE_STATUS.md](FEATURE_STATUS.md) for maturity.

## Leads

- **UI:** `/leads` (list, tabs, filters, bulk assign), `/leads/new`, `/leads/[id]` (the lead workspace: status, notes, phones, requirements, matches, catalogues, visits, WhatsApp, timeline), `/leads/portal` (portal-delivered leads).
- **Components:** `components/leads/lead-workspace.tsx`, `lead-form.tsx`, `lead-filters.tsx`, `leads-table.tsx`, `lead-phones-panel.tsx`.
- **API:** `GET/POST /api/leads`; `GET/PATCH /api/leads/[id]`; `/assign`, `/auto-assign`, `/transfer`, `/notes`, `/phones`, `/call-initiated`, `/record-call`, `/health`, `/recalculate-score`, `/needs-attention`, `/bulk`, `/bulk-auto-assign`, `/export`.
- **Logic:** `lib/validators.ts` (schemas), `lib/lead-access.ts` (who may open what), `lib/lead-phones.ts`, `lib/activity.ts`, `lib/audit.ts`, `lib/rules/lead-health.ts`, `lib/needs-attention.ts`.
- **Models:** `Lead`, `LeadPhone`, `LeadTransfer`, `LeadAssignmentHistory`, `Activity`.

## Properties (inventory)

- **UI:** `/properties` (filters incl. BHK/1 RK, residential/commercial), `/properties/new`, `/properties/[id]`, `/properties/[id]/edit`, `/properties/[id]/matches`, `/properties/import` (+ `/history`).
- **Components:** `components/properties/*` (`property-form.tsx`, `property-card.tsx`, `property-filters.tsx`, `property-picker-dialog.tsx`).
- **API:** `GET/POST /api/properties`; `/api/properties/[id]` (+ `/images`, `/media/*`, `/location`, `/geocode`, `/capture-location`, `/verify`, `/availability-report`, `/report`, `/timeline`, `/favorite`, `/matches`, `/nearby`, `/internal`); `/search`, `/bulk`, `/export`, `/import/*`.
- **Logic:** `lib/property-list-query.ts`, `lib/property-list-filters.ts`, `lib/property-categories.ts` (labels), `lib/property-locality.ts`, `lib/property-images.ts`, `lib/storage*.ts`, `lib/inventory-import-*.ts`, `lib/rules/property-health.ts`, `lib/property-rematch.ts`.
- **Models:** `Property`, `PropertyLocality(+Alias)`, `PropertyImage`, `PropertyTimelineEvent`, `PropertyAvailabilityReport`, `PropertyReport`, `Owner`, `InventoryPartner`.
- Field executives can list properties but only see internal detail (exact address, owner contact, GPS) for properties on their visits or in their leads' catalogues (`lib/property-access.ts`). `DELETE` is a soft deactivate.

## Requirements

- **UI:** panel inside the lead page (`components/leads/lead-requirements-panel.tsx`, `client-preferences-panel.tsx`); `/requirements` (admin board of broadcasts).
- **API:** `GET/POST /api/leads/[id]/requirements`, `/api/leads/[id]/requirements/[requirementId]`; `/api/requirements`, `/api/requirements/broadcasts`.
- **Logic:** `lib/lead-requirement-matching.ts`; commercial and residential differ (commercial types, area, fit-out).
- **Models:** `LeadRequirement`, `LeadRequirementBhk`, `LeadRequirementLocality`.
- An ACTIVE requirement overrides the lead's top-level preference fields when matching.

## Matching

- **UI:** `/leads/[id]/match` (`components/leads/property-matching-workspace.tsx`, `new-matches-panel.tsx`) and `/properties/[id]/matches` (leads for a property).
- **API:** `GET /api/leads/[id]/match` (`?tolerance=`), `GET /api/properties/[id]/matches`, `/api/match-recommendations` (+ `/approve`).
- **Logic:** `lib/matching.ts` (weights: budget 30, location 25, BHK 20, furnishing 10, availability 8, type 7, plus small verified/image/possession bonuses, capped at 100; each score carries reasons), `lib/lead-matching.ts` (run on lead create/update), `lib/property-rematch.ts` (re-run when a property changes), `lib/match-recommendations.ts`, `lib/match-history.ts`.
- **Models:** `MatchRecommendation`, `SharedPropertyLog`, `PropertyRecommendation` (legacy).
- BHK distance: exact match full score, off-by-one half. Labels come from `residentialConfigurationLabel`, so 1 RK reads correctly.

## Visits

- **UI:** `/visits` (tabs: Today, Upcoming, Needs Outcome, Completed, All Visits, Employee-wise), `/visits/[id]` (multi-property workflow), schedule dialogs in the lead page.
- **Components:** `components/visits/visit-property-workflow.tsx`, `pending-visit-requests.tsx`, `components/leads/visit-schedule-with-candidates.tsx`.
- **API:** `GET/POST /api/visits`; `/api/visits/[id]` + `/start`, `/complete`, `/cancel`, `/reschedule`, `/feedback`, `/preferred`, `/properties/[propertyId]`; `/api/visits/suggested-route`; `/api/catalogues/[id]/schedule-visit`.
- **Logic:** `lib/visits.ts` (state machine: `scheduleVisit`, `startVisit`, `recordVisitPropertyOutcome`, `completeVisit`, `rescheduleVisit`, `cancelVisit`, `logCompletedVisitForLead`), `lib/visit-progress.ts`, `lib/route-suggestion.ts`.
- **Models:** `Visit`, `VisitProperty`, `VisitFeedback`. Scheduling moves the lead to `VISIT_SCHEDULED`; completing moves it to `VISIT_COMPLETED` (only from a pre-visit state).

## Completed Visits and "Visit Completed requires a visit"

- **UI:** Visits → **Completed** tab (`(app)/visits/page.tsx`, filter `completedVisitsWhere` in `lib/visit-progress.ts`); the lead page status dropdown; `components/leads/log-completed-visit-dialog.tsx` ("No visit on record").
- **API:** `PATCH /api/leads/[id]` (status change) and `POST /api/leads/[id]/completed-visit`.
- **Behaviour:**
  1. Status → Visit Completed with an **active visit** (`SCHEDULED, CONFIRMED, CLIENT_REACHED, EMPLOYEE_REACHED, IN_PROGRESS`): `completeActiveVisitForLeadStatusChange` completes the newest one, writes an activity and an audit entry.
  2. **No such visit:** `409` with `code: "VISIT_REQUIRED"`, `requiresVisit: true`, title "No visit on record" (constants in `lib/visit-required.ts`, shared by server and client). `POST /api/leads` also guards this.
  3. The UI reverts the dropdown and opens the dialog. The user chooses property, employee, date and time (and optional notes). `POST …/completed-visit` calls `logCompletedVisitForLead`, which **in one transaction** creates one `COMPLETED` Visit (+ its `VisitProperty`) and sets the lead to `VISIT_COMPLETED`, then logs activity/audit and recalculates the score. Internal only: no WhatsApp/email/webhook.
  4. Access: a field executive may do this only for a lead assigned to them.
- **Why:** previously a lead could read "Visit Completed" with no visit record, which corrupted the Completed tab, visit reports and scoring. Now the lead status and the visit table cannot disagree.

## Follow-ups

- **UI:** `/follow-ups` (overdue / today / upcoming buckets; admin + data manager), follow-up creation inside lead and visit flows, `components/followups/*`.
- **API:** `GET/POST /api/follow-ups` (`?bucket=`), `PATCH /api/follow-ups/[id]`.
- **Logic:** `lib/follow-up-types.ts`, `lib/followup-context.ts`, `lib/rules/followup-recommendations.ts`, `lib/dm-call-outcomes.ts` (call outcome → next follow-up), `lib/record-call.ts`.
- **Models:** `FollowUp`.

## Scoring

- **UI:** score and factor breakdown on the lead page; Hot/Warm/Cold badges.
- **API:** `POST /api/leads/[id]/recalculate-score`.
- **Logic:** `lib/scoring.ts` → `recalculateLeadScore(leadId, trigger)`; `OLX` is a medium-quality source. Triggers: create/edit/status change/visit/share/WhatsApp reply/catalogue engagement.
- **Models:** `LeadScoreHistory`, `Lead.score/priority`.

## Assignment

- **UI:** Settings → Automatic Lead Assignment (`components/settings/assignment-rules-panel.tsx`); "Run auto assignment" on a lead; bulk button on `/leads`.
- **API:** `/api/assignment-rules` (+ `/[id]`), `/api/leads/[id]/auto-assign`, `/api/leads/bulk-auto-assign`, `/api/leads/[id]/assign`, `/transfer`.
- **Logic:** `lib/assignment.ts` (`selectEmployeeForLead`, `autoAssignLead`, `bulkAutoAssign`): strategies `ROUND_ROBIN, LOWEST_WORKLOAD, LOCATION_BASED, SPECIALITY, MANUAL_ONLY` evaluated by rule priority, respecting `maxActiveLeads`, availability and service areas.
- **Models:** `LeadAssignmentRule`, `EmployeeServiceArea`, `LeadAssignmentHistory`.

## Reports and dashboards

- **UI:** `/dashboard`, `/executive-dashboard` ("Today's Work"), `/owner-dashboard`, `/reports` plus `/reports/{activity, brokerage, builder, employees, localities, lost-deals, phase5, portals}`. (`/reports/demand` redirects to `/reports`.)
- **API:** `/api/dashboard` (+ `/actions`, `/field-ops-summary`, `/inventory-split`), `/api/reports`, `/api/reports/export`, `/api/executive/today`.
- **Logic:** `lib/dashboard-data.ts`, `dm-dashboard-data.ts`, `executive-dashboard-data.ts`, `reports-data.ts`, `report-builder.ts`, `*-analytics-data.ts`. Aggregates are cached briefly in Redis when available.

## Search

- **UI:** global search box (`components/search/*`).
- **API:** `GET /api/search`, `GET /api/properties/search`.
- **Logic:** `lib/search/` (tokenizer, parser, filters, entity search). Natural-ish queries are parsed into structured filters.

## Nearby properties

- **UI:** property detail "nearby" panel; map components in `components/maps/*`.
- **API:** `GET /api/properties/[id]/nearby`.
- **Logic:** `lib/nearby-properties.ts` (haversine radius 1/3/5/10 km), `lib/geo.ts`. Works from stored coordinates, so it does not need a maps provider.

## Catalogue (public sharing)

- **UI (staff):** `/catalogues`, `/catalogues/[id]/internal`, `/leads/[id]/catalogue/new`. **UI (client, no login):** `/share/catalogue/[token]`, `/p/[id]`.
- **API:** staff: `/api/leads/[id]/catalogues` (+ `/[catalogueId]`, `/send`, `/revoke`, `/whatsapp-link`), `/api/catalogues`, `/api/catalogues/[id]/*`. Public: `/api/catalogues/public/[token]` (+ `/view`, `/interactions`, `/preferences`).
- **Logic:** `lib/catalogues.ts`, `catalogue-dto.ts` (whitelist DTO), `catalogue-interactions.ts` (interested / not interested / visit request / question), `catalogue-property-preferences.ts`, `catalogue-specs.ts`.
- **Models:** `CatalogueShare`, `CatalogueShareProperty`, `CatalogueInteraction`, `CataloguePropertyPreference`, `CatalogueVersionEvent`.
- A client's "Request visit" creates a follow-up, not a confirmed visit. A human schedules the visit.

## WhatsApp

- **UI:** lead page WhatsApp tab; `/whatsapp` inbox (admin); Settings diagnostics (`components/whatsapp/*`, `components/settings/whatsapp-diagnostics-panel.tsx`).
- **API:** `/api/leads/[id]/whatsapp/*` (conversation, messages, retry, mark-opened, simulate-reply/status in MOCK), `/api/whatsapp/inbox/*`, `/api/whatsapp/templates`, `/api/integrations/whatsapp/webhook`, `/api/system/whatsapp-health`, `/api/system/whatsapp-test-send`.
- **Logic:** `integrations/whatsapp/*` (see [INTEGRATIONS.md](INTEGRATIONS.md)).
- **Models:** `WhatsAppConversation`, `WhatsAppMessage`, `IntegrationWebhookEvent`.

## 99acres (and other portals)

- **UI:** `/integrations/property-portals` (+ `/conflicts`, `/housing-import`), `/leads/portal`, `/reports/portals`.
- **API:** `POST /api/integrations/99acres/leads`, `POST /api/integrations/housing/leads`, `POST /api/integrations/property-portals/[provider]/webhook`, `/api/portal-leads`, `/api/portal-listings`, `/api/portal-operations/[id]/retry`.
- **Logic:** `integrations/ninety-nine-acres/*`, `integrations/property-portals/*` (ingestion, idempotency, listing mapping), `integrations/housing/*`.
- **Models:** `ExternalLeadEvent`, `PropertyPortalConnection`, `PortalListing`, `PortalOperation`.

## Admin and settings

- **UI:** `/settings` (system config, assignment rules, automation rules, maps and WhatsApp diagnostics, employee-directory label), `/settings/security` (own password; every role), `/employees` (+ `/[id]`), `/admin/property-issues`, `/documents`, `/deals`, `/inventory-partners`.
- **API:** `/api/employees/*` (incl. `account-status`, `setup-link`, `reset-link`), `/api/system-config`, `/api/automation-rules`, `/api/backups`, `/api/system/*`, `/api/admin/*`.
- **Models:** `User`, `SystemConfig`, `AutomationRule`, `BackupRecord`.

## Activity and audit

- **Activity:** `lib/activity.ts` (`logActivity`), shown as the lead timeline; `GET /api/activities?leadId=`; `/reports/activity`.
- **Audit:** `lib/audit.ts` (`recordAudit`), `GET /api/audit-logs` (admin). Sensitive keys (passwords, tokens, ID numbers) are redacted before storing.
- **Notifications:** `lib/notifications.ts`; header bell + `/notifications`; `/api/notifications/*`; sweep at `/api/internal/notifications/sweep`.

Next: [ROLES_AND_PERMISSIONS.md](ROLES_AND_PERMISSIONS.md).
