-- Read-only. Checks whether the tracked migration
-- 20260817190000_catalogue_visit_workflow has a ledger row in
-- _prisma_migrations, so we know whether `prisma migrate resolve --applied`
-- is the correct next step (schema is live, applied via the manual SQL
-- file, but Prisma's own ledger doesn't know that yet).

SELECT migration_name, started_at, finished_at, applied_steps_count, rolled_back_at
FROM "_prisma_migrations"
WHERE migration_name = '20260817190000_catalogue_visit_workflow';
