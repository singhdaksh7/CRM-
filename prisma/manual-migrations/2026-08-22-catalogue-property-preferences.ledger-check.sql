-- Read-only. Checks whether the tracked migration
-- 20260822150000_catalogue_property_preferences has a ledger row in
-- _prisma_migrations.

SELECT migration_name, started_at, finished_at, applied_steps_count, rolled_back_at
FROM "_prisma_migrations"
WHERE migration_name = '20260822150000_catalogue_property_preferences';
