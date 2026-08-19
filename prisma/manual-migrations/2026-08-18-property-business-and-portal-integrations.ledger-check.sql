-- Read-only. Checks whether the two tracked migrations for this feature
-- (20260817200000_property_business_portals and
--  20260817230000_portal_operations_conflicts) have ledger rows in
-- _prisma_migrations, so we know whether `prisma migrate resolve --applied`
-- is the correct next step for each (schema is live, applied via the manual
-- SQL files, but Prisma's own ledger doesn't know that yet).

SELECT migration_name, started_at, finished_at, applied_steps_count, rolled_back_at
FROM "_prisma_migrations"
WHERE migration_name IN (
  '20260817200000_property_business_portals',
  '20260817230000_portal_operations_conflicts'
)
ORDER BY migration_name;
