-- Verification for 2026-08-07-phase4-field-operations.sql
-- Read-only. Run after applying the migration above. Every query here is a
-- SELECT against catalog views or a count(*) - it cannot write.

-- Expected: 6 rows (all six new Phase 4 enums exist).
SELECT typname FROM pg_type
WHERE typname IN (
  'InventorySource', 'CatalogueExecutiveStatus', 'AvailabilityReportStatus',
  'AvailabilityReportReason', 'PropertyReportType', 'PropertyReportStatus'
)
ORDER BY typname;

-- Expected: 2 rows - DIRECT, INDIRECT.
SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'InventorySource' ORDER BY e.enumsortorder;

-- Expected: 6 rows on VisitOutcome added by this migration.
SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'VisitOutcome'
  AND e.enumlabel IN ('CUSTOMER_NO_SHOW', 'OWNER_NO_SHOW', 'NEGOTIATION_IN_PROGRESS', 'SHORTLISTED', 'REJECTED', 'FOLLOW_UP_NEEDED')
ORDER BY e.enumlabel;

-- Expected: 16 rows on ActivityType added by this migration.
SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'ActivityType'
  AND e.enumlabel IN (
    'EXECUTIVE_ASSIGNED', 'VISIT_OUTCOME_RECORDED', 'VISIT_FEEDBACK_SUBMITTED',
    'PROPERTY_AVAILABILITY_REPORTED', 'PROPERTY_AVAILABILITY_APPROVED', 'PROPERTY_AVAILABILITY_REJECTED',
    'PROPERTY_REPORTED', 'PROPERTY_REPORT_RESOLVED', 'PROPERTY_TIMELINE_EVENT', 'PROPERTY_VERIFIED',
    'CATALOGUE_INTERNAL_SHARED', 'CATALOGUE_PROPERTY_STATUS_UPDATED', 'CATALOGUE_VERSION_CHANGED',
    'INVENTORY_PARTNER_CREATED', 'INVENTORY_PARTNER_UPDATED', 'CALL_INITIATED'
  )
ORDER BY e.enumlabel;

-- Expected: 6 rows on NotificationType added by this migration.
SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'NotificationType'
  AND e.enumlabel IN (
    'AVAILABILITY_REPORT_SUBMITTED', 'AVAILABILITY_REPORT_APPROVED', 'AVAILABILITY_REPORT_REJECTED',
    'PROPERTY_REPORT_SUBMITTED', 'PROPERTY_REPORT_RESOLVED', 'INTERNAL_CATALOGUE_SHARED'
  )
ORDER BY e.enumlabel;

-- Expected: 1 row - AVAILABILITY_REPORT.
SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'PropertyImagePurpose' AND e.enumlabel = 'AVAILABILITY_REPORT';

-- Expected: 9 rows (all nine new Phase 4 tables).
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN (
  'inventory_partners', 'property_timeline_events', 'property_availability_reports',
  'property_reports', 'visit_feedback', 'lead_assignment_history',
  'catalogue_version_events', 'property_favorites', 'property_view_logs'
)
ORDER BY table_name;

-- Expected: 15 rows - every new column this migration adds to existing tables.
SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND (
  (table_name = 'properties' AND column_name IN (
    'inventorySource', 'partnerId', 'buildingName', 'flatNumber', 'gateNumber', 'propertySource',
    'keyAvailability', 'entryInstructions', 'internalNotes', 'negotiationNotes', 'hiddenRemarks',
    'imagesUpdatedAt', 'pendingVerification', 'lastVerifiedAt', 'lastVerifiedById'
  ))
)
ORDER BY column_name;

-- Expected: is_nullable = 'YES' for both - the only non-additive change in
-- this migration (an INDIRECT property has no Owner, only an InventoryPartner).
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'properties' AND column_name IN ('ownerName', 'ownerPhone')
ORDER BY column_name;

-- Expected: 1 row each - notifications.inventoryPartnerId, activities.inventoryPartnerId,
-- catalogue_shares.version.
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = 'public' AND (
  (table_name = 'notifications' AND column_name = 'inventoryPartnerId') OR
  (table_name = 'activities' AND column_name = 'inventoryPartnerId') OR
  (table_name = 'catalogue_shares' AND column_name = 'version')
)
ORDER BY table_name, column_name;

-- Expected: 6 rows - every new column on catalogue_share_properties.
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'catalogue_share_properties'
  AND column_name IN (
    'executiveStatus', 'executiveStatusUpdatedAt', 'executiveStatusUpdatedById',
    'executiveStatusNote', 'removedAt', 'removedReason'
  )
ORDER BY column_name;

-- Expected: 5 rows - the new indexes this migration adds on existing tables
-- (2 on properties, 1 on activities) plus 2 unique constraints on new tables
-- worth spot-checking here (inventory_partners.partnerCode, visit_feedback.visitId).
SELECT indexname, tablename FROM pg_indexes
WHERE indexname IN (
  'properties_organizationId_inventorySource_idx', 'properties_partnerId_idx',
  'activities_inventoryPartnerId_idx', 'inventory_partners_partnerCode_key', 'visit_feedback_visitId_key'
)
ORDER BY indexname;

-- Expected: 20 rows - every FK this migration adds (2 on existing tables'
-- new columns beyond properties/activities/notifications' own 3, plus every
-- new table's FKs). Spot-checks the full set by name.
SELECT conname, conrelid::regclass AS table_name, confrelid::regclass AS references_table
FROM pg_constraint
WHERE conname IN (
  'notifications_inventoryPartnerId_fkey', 'properties_partnerId_fkey', 'properties_lastVerifiedById_fkey',
  'activities_inventoryPartnerId_fkey', 'catalogue_share_properties_executiveStatusUpdatedById_fkey',
  'inventory_partners_organizationId_fkey', 'inventory_partners_createdById_fkey',
  'property_timeline_events_organizationId_fkey', 'property_timeline_events_propertyId_fkey', 'property_timeline_events_actorId_fkey',
  'property_availability_reports_organizationId_fkey', 'property_availability_reports_propertyId_fkey',
  'property_availability_reports_visitId_fkey', 'property_availability_reports_reportedById_fkey',
  'property_availability_reports_photoId_fkey', 'property_availability_reports_reviewedById_fkey',
  'property_reports_organizationId_fkey', 'property_reports_propertyId_fkey',
  'property_reports_reportedById_fkey', 'property_reports_resolvedById_fkey'
)
ORDER BY conname;

-- Expected: 0 rows for every new table - this migration creates no rows,
-- only schema. Confirms the migration itself never wrote demo/seed data.
SELECT
  (SELECT count(*) FROM inventory_partners) AS inventory_partners_rows,
  (SELECT count(*) FROM property_timeline_events) AS property_timeline_events_rows,
  (SELECT count(*) FROM property_availability_reports) AS property_availability_reports_rows,
  (SELECT count(*) FROM property_reports) AS property_reports_rows,
  (SELECT count(*) FROM visit_feedback) AS visit_feedback_rows,
  (SELECT count(*) FROM lead_assignment_history) AS lead_assignment_history_rows,
  (SELECT count(*) FROM catalogue_version_events) AS catalogue_version_events_rows,
  (SELECT count(*) FROM property_favorites) AS property_favorites_rows,
  (SELECT count(*) FROM property_view_logs) AS property_view_logs_rows;

-- Expected: matches the row count of "properties" - every existing property
-- backfilled to inventorySource='DIRECT', pendingVerification=false, no data loss.
SELECT
  (SELECT count(*) FROM properties) AS total_properties,
  (SELECT count(*) FROM properties WHERE "inventorySource" = 'DIRECT') AS direct_properties,
  (SELECT count(*) FROM properties WHERE "pendingVerification" = false) AS not_pending_verification;
