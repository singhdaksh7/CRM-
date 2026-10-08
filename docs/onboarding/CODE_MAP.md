# Code Map

Exact paths for the capabilities you are most likely to touch. All paths are from the repository root. Unit tests are co-located (`x.ts` → `x.test.ts`) unless noted; Playwright specs are in `tests/e2e/`.

## Lead status

- **UI:** `src/components/leads/lead-workspace.tsx` (status dropdown, VISIT_REQUIRED handling ~line 500), `src/app/(app)/leads/[id]/page.tsx`, `src/components/leads/leads-table.tsx`
- **API:** `src/app/api/leads/[id]/route.ts` (`PATCH`), `src/app/api/leads/route.ts` (`POST` create), `src/app/api/leads/bulk/route.ts`
- **Validation:** `src/lib/validators.ts` (lead schemas, `LeadStatus` enum list)
- **Side effects:** `src/lib/activity.ts` (timeline), `src/lib/audit.ts`, `src/lib/scoring.ts` (`recalculateLeadScore`), `src/lib/notifications.ts`
- **Access:** `src/lib/lead-access.ts`
- **Tests:** `src/app/api/leads/leads-route.test.ts`, `leads-route-isolation.test.ts`, `src/app/api/leads/[id]/lead-detail-access.test.ts`, `leads-id-route-lost-reason.test.ts`

## Property matching

- **UI:** `src/app/(app)/leads/[id]/match/page.tsx`, `src/components/leads/property-matching-workspace.tsx`, `new-matches-panel.tsx`; reverse: `src/app/(app)/properties/[id]/matches/page.tsx`
- **Algorithm:** `src/lib/matching.ts` (weights and `matchPropertiesToLead`), `src/lib/lead-requirement-matching.ts` (`matchPropertiesToRequirements`, used when an ACTIVE requirement exists), commercial rules in the same modules, `src/lib/lead-matching.ts` (`runMatchingForLead`), `src/lib/property-rematch.ts`, `src/lib/match-recommendations.ts`
- **API:** `src/app/api/leads/[id]/match/route.ts`, `src/app/api/properties/[id]/matches/route.ts`, `src/app/api/match-recommendations/route.ts` (+ `approve`)
- **Tests:** `src/lib/matching.test.ts`, `lead-matching.test.ts`, `lead-requirement-matching.test.ts`, `commercial-matching.test.ts`, `matching-business-lines.test.ts`, `src/app/api/properties/[id]/matches/properties-matches-route-*.test.ts`, `src/app/api/leads/[id]/match/lead-match-route-access.test.ts`

## Visit scheduling and lifecycle

- **UI:** `src/app/(app)/visits/page.tsx`, `src/app/(app)/visits/[id]/page.tsx`, `src/components/visits/visit-property-workflow.tsx`, `src/components/leads/visit-schedule-with-candidates.tsx`
- **API:** `src/app/api/visits/route.ts`, `src/app/api/visits/[id]/{start,complete,cancel,reschedule,feedback,preferred}/route.ts`, `src/app/api/visits/[id]/properties/[propertyId]/route.ts`
- **Service:** `src/lib/visits.ts` (`scheduleVisit`, `startVisit`, `recordVisitPropertyOutcome`, `completeVisit`, `rescheduleVisit`, `cancelVisit`), `src/lib/visit-progress.ts`, `src/lib/visit-conflict*.ts`, `src/lib/visit-detail-dto.ts`
- **Tests:** `src/lib/visits.test.ts`, `visit-workflow.test.ts`, `visit-conflict.test.ts`, `src/app/api/visits/visit-workflow-routes.test.ts`, `visit-conflict-routes.test.ts`, e2e `tests/e2e/admin/multi-property-visit.spec.ts`, `visit-outcome.spec.ts`

## Visit Completed (requires a visit) and Completed tab

- **UI:** `src/components/leads/log-completed-visit-dialog.tsx` ("No visit on record"), `src/components/leads/lead-workspace.tsx`, `src/app/(app)/visits/page.tsx` (tab `completed`)
- **API:** `src/app/api/leads/[id]/route.ts` (409 `VISIT_REQUIRED`), `src/app/api/leads/route.ts`, `src/app/api/leads/[id]/completed-visit/route.ts`
- **Contract (shared client/server):** `src/lib/visit-required.ts` (`VISIT_REQUIRED_CODE`, title, message)
- **Service:** `src/lib/visits.ts`: `completeActiveVisitForLeadStatusChange`, `hasCompletableVisitForLead`, `logCompletedVisitForLead` (single transaction); tab filter `completedVisitsWhere` in `src/lib/visit-progress.ts`
- **Tests:** `src/lib/log-completed-visit.test.ts`, `src/lib/manual-lead-visit-completion.test.ts`, `src/app/api/leads/[id]/leads-id-route-visit-required.test.ts`, `src/app/api/leads/[id]/completed-visit/completed-visit-route.test.ts`; e2e `tests/e2e/admin/visit-required-flow.spec.ts`, `tests/e2e/admin/one-rk-olx-visit-sync.spec.ts`

## 1 RK (`bhk = 0`)

- **Formatter:** `src/lib/property-categories.ts` → `residentialConfigurationLabel`, `propertySpecSummary`
- **Filters:** `src/lib/property-list-filters.ts` (`parsePropertyBhkFilter`, `resolvePropertyListBhkFilter`, `propertyListBhkWhere`), `src/lib/property-list-query.ts`, `src/app/(app)/properties/page.tsx`, `src/components/properties/property-filters.tsx`
- **Matching:** `src/lib/matching.ts` (BHK scoring/labels), `src/lib/demand-matching.ts`
- **Other renderers:** `src/lib/catalogue-specs.ts`, `catalogue-dto.ts`, `src/integrations/whatsapp/whatsapp-template-renderer.ts` (WhatsApp copy), `src/lib/inventory-import-core.ts` (parses "1 RK" on import), `src/components/properties/property-card.tsx`, `properties-table.tsx`
- **Tests:** `src/lib/residential-configuration.test.ts`, `property-categories.test.ts`, `property-list-filters.test.ts`, `properties-page-bhk-filter.test.ts`, `catalogue-specs.test.ts`, `src/integrations/whatsapp/whatsapp-template-renderer.test.ts`, e2e `tests/e2e/admin/one-rk-olx-visit-sync.spec.ts`
- **Reminder:** commercial rows also have `bhk = 0`. Anything that shows BHK must check `assetClass`. Presence checks use `!== null`, never truthiness.

## OLX

- **Enum:** `prisma/schema.prisma` → `LeadSource.OLX` and `PropertyPortalProvider.OLX`
- **Form / filters:** `src/components/leads/lead-form.tsx`, `src/components/leads/lead-filters.tsx`
- **Validation:** `src/lib/validators.ts` (`source: z.enum([... "OLX" ...])`)
- **Assignment rules UI:** `src/components/settings/assignment-rules-panel.tsx`
- **Scoring:** `src/lib/scoring.ts` (`MEDIUM_QUALITY_SOURCES` includes `OLX`)
- **Portal adapter:** `src/integrations/property-portals/awaiting-access-adapters.ts` (OLX skeleton; no live API integration)
- **Tests:** e2e `tests/e2e/admin/one-rk-olx-visit-sync.spec.ts`; `src/integrations/property-portals/*.test.ts`

## Residential vs commercial separation

- **Validation:** `src/lib/commercial-property-validation.test.ts` ↔ property schema in `src/lib/validators.ts`
- **Matching:** `src/lib/matching.ts`, `src/lib/lead-requirement-matching.ts`
- **API filters:** `src/app/api/properties/route.ts`; tests `properties-route-commercial-filters.test.ts`
- **Requirements:** `src/app/api/leads/[id]/requirements/route.ts`; test `requirements-route-commercial.test.ts`
- **Catalogue/public:** `src/lib/catalogue-dto.ts`; test `catalogue-dto-commercial.test.ts`
- **Import:** `src/lib/inventory-import-core.ts`; test `inventory-import-commercial.test.ts`

## Catalogue sharing

- **UI:** `src/app/(app)/catalogues/**`, `src/app/(app)/leads/[id]/catalogue/new`, public `src/app/share/catalogue/[token]/page.tsx`, `src/components/catalogues/*`
- **API:** `src/app/api/leads/[id]/catalogues/**`, `src/app/api/catalogues/**`, public `src/app/api/catalogues/public/[token]/**`
- **Service:** `src/lib/catalogues.ts`, `catalogue-dto.ts`, `catalogue-interactions.ts`, `catalogue-property-preferences.ts`
- **Tests:** `src/lib/catalogue-*.test.ts`, `catalogues-org-isolation.test.ts`, `src/app/api/catalogues/public/[token]/*.test.ts`; e2e `tests/e2e/public/*`

## WhatsApp

- **Providers/service:** `src/integrations/whatsapp/` (`whatsapp-service.ts`, `whatsapp-config.ts`, `mock-/click-to-chat-/meta-whatsapp-provider.ts`)
- **API:** `src/app/api/leads/[id]/whatsapp/**`, `src/app/api/whatsapp/**`, `src/app/api/integrations/whatsapp/webhook/route.ts`
- **UI:** `src/components/whatsapp/*`, `src/app/(app)/whatsapp/page.tsx`
- **Tests:** `src/integrations/whatsapp/*.test.ts`, `src/app/api/integrations/whatsapp/webhook/route.test.ts`, `src/lib/whatsapp-*.test.ts`; e2e `tests/e2e/public/zero-auto-send.spec.ts`

## 99acres

- **Route:** `src/app/api/integrations/99acres/leads/route.ts`
- **Config/auth:** `src/integrations/ninety-nine-acres/config.ts`; payload handling `payload.ts`; field mapping `adapter.ts` (`ALIASES`)
- **Ingestion:** `src/integrations/property-portals/ingestion.ts`
- **Docs:** `docs/99acres-lead-webhook.md`
- **Tests:** `route.test.ts`, `no-unauthenticated-ingestion.test.ts`, `src/integrations/ninety-nine-acres/adapter.test.ts`

## Auth, roles, tenancy

- `src/lib/auth.ts` (Auth.js config), `src/lib/credential-auth.ts`, `src/lib/session-guard.ts`, `src/proxy.ts`, `src/lib/permissions.ts`, `src/lib/api-auth.ts`, `src/lib/organization.ts`, `src/lib/account-setup.ts`, `src/lib/password-reset.ts`
- Tests: `auth-callbacks.test.ts`, `auth-org-resolution.test.ts`, `session-guard.test.ts`, `permissions-*.test.ts`, `organization.test.ts`, `*-org-isolation.test.ts`

## Notifications and follow-ups

- `src/lib/notifications.ts`, `src/app/api/notifications/**`, `src/app/api/internal/notifications/sweep/route.ts`, `src/lib/follow-up-types.ts`, `src/app/api/follow-ups/**`, `src/components/notifications/*`, `src/components/followups/*`; tests `notifications.test.ts`, `follow-ups-security.test.ts`; e2e `tests/e2e/admin/follow-up.spec.ts`

## Reports and dashboards

- `src/lib/dashboard-data.ts`, `reports-data.ts`, `report-builder.ts`, `*-analytics-data.ts`; pages under `src/app/(app)/reports/**`, `dashboard`, `executive-dashboard`; tests `dashboard-data*.test.ts`, `report-builder.test.ts`

## Storage and images

- `src/lib/storage.ts`, `src/lib/storage-providers/*`, `src/lib/property-images.ts`, `src/app/api/properties/[id]/media/**`, `src/components/properties/property-image-uploader.tsx`; tests `storage-providers/*.test.ts`, `property-image*.test.ts`

## Demo data and seeds

- `scripts/seed-demo.ts`, `scripts/seed-demo-dry-run.ts`, `scripts/seed-demo-verify.ts`, `scripts/remove-demo.ts`; builders in `src/lib/demo-data/*` (safety guard: `safety-guard.ts`); legacy `prisma/seed.ts`; QA identities `tests/e2e/setup/seed-qa.ts`

Next: [TESTING.md](TESTING.md).
