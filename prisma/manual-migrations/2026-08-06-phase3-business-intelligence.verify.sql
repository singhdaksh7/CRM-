-- Verification for 2026-08-06-phase3-business-intelligence.sql
-- Read-only. Run after applying the migration above. Every query here is a
-- SELECT against catalog views - it cannot write.

-- Expected: 3 rows (all three Phase 3 enums exist).
SELECT typname FROM pg_type
WHERE typname IN ('LostDealReasonCategory', 'AutomationTrigger', 'AutomationActionType')
ORDER BY typname;

-- Expected: 8 rows, PRICE..OTHER in the order defined in schema.prisma.
SELECT e.enumlabel, e.enumsortorder
FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'LostDealReasonCategory'
ORDER BY e.enumsortorder;

-- Expected: 1 row (deals.lostReasonCategory is nullable, no default, USER-DEFINED enum type).
SELECT column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'deals' AND column_name = 'lostReasonCategory';

-- Expected: 0 rows immediately after migration (existing 10 deals should
-- all be NULL, not backfilled to any category).
SELECT count(*)::int AS non_null_lost_reason_category
FROM deals WHERE "lostReasonCategory" IS NOT NULL;

-- Expected: 2 rows (system_configs, automation_rules).
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('system_configs', 'automation_rules')
ORDER BY table_name;

-- Expected: system_configs has exactly these 6 columns.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'system_configs'
ORDER BY ordinal_position;

-- Expected: automation_rules has exactly these 9 columns.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'automation_rules'
ORDER BY ordinal_position;

-- Expected: 1 row - organizationId is UNIQUE on system_configs (singleton per org).
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'system_configs' AND indexname = 'system_configs_organizationId_key';

-- Expected: 1 row - the (organizationId, trigger, isActive) lookup index automation rule execution depends on.
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'automation_rules' AND indexname = 'automation_rules_organizationId_trigger_isActive_idx';

-- Expected: 4 rows (2 FKs per new table).
SELECT conname, conrelid::regclass AS table_name, confrelid::regclass AS references_table
FROM pg_constraint
WHERE conname IN (
  'system_configs_organizationId_fkey', 'system_configs_updatedById_fkey',
  'automation_rules_organizationId_fkey', 'automation_rules_createdById_fkey'
)
ORDER BY conname;

-- Expected: 0 rows (both tables start empty - this migration creates no
-- default AutomationRule or SystemConfig row, so nothing is auto-enabled
-- in production; every automation rule must be created explicitly by an
-- Admin after review, per the "do not enable any automation rule by
-- default" requirement).
SELECT
  (SELECT count(*) FROM system_configs) AS system_configs_rows,
  (SELECT count(*) FROM automation_rules) AS automation_rules_rows;

-- Pre-existing gap, unrelated to Phase 3 - included here only so this
-- verification file gives a complete picture of migration-ledger health.
-- Expected: 0 rows if 20260805160000_property_matching_workflow has since
-- been reconciled via `prisma migrate resolve --applied`; 1 row otherwise
-- (a DDL-vs-ledger gap, not a missing-column problem - see the .sql file's
-- header comment).
SELECT migration_name FROM "_prisma_migrations"
WHERE migration_name = '20260805160000_property_matching_workflow';
