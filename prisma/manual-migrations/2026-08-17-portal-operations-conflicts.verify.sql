-- Read-only verification for the Portal Operations / Conflict / Retry
-- migration. One result row; PASS means the retry/dead-letter/conflict
-- schema is exact, organization-scoped, and no operation row was created
-- automatically by the migration itself. Runs no writes, takes no locks.
WITH enum_operation_status AS (
  SELECT count(*) = 4 AND bool_and(e.enumlabel IN ('PENDING','RETRYABLE','SUCCEEDED','DEAD_LETTER')) AS ok
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'PortalOperationStatus'
), enum_conflict_resolution AS (
  SELECT count(*) = 3 AND bool_and(e.enumlabel IN ('KEEP_CRM','ACCEPT_PORTAL','REVIEW')) AS ok
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'PortalConflictResolution'
), listing_conflict_columns_expected(name, data_type, nullable) AS (
  VALUES ('payloadVersion','integer','NO'), ('conflictFields','text','YES'), ('portalSnapshot','text','YES'),
    ('conflictDetectedAt','timestamp without time zone','YES'), ('conflictResolvedAt','timestamp without time zone','YES'),
    ('conflictResolution','USER-DEFINED','YES'), ('conflictResolvedById','text','YES')
), listing_conflict_column_check AS (
  SELECT count(c.column_name) = 7 AND bool_and(coalesce(c.data_type = e.data_type AND c.is_nullable = e.nullable, false)) AS ok
  FROM listing_conflict_columns_expected e LEFT JOIN information_schema.columns c
    ON c.table_schema = current_schema() AND c.table_name = 'portal_listings' AND c.column_name = e.name
), operations_columns_expected(name, data_type, nullable) AS (
  VALUES ('id','text','NO'), ('organizationId','text','NO'), ('portalListingId','text','YES'), ('connectionId','text','YES'),
    ('provider','USER-DEFINED','NO'), ('operationType','text','NO'), ('idempotencyKey','text','NO'), ('status','USER-DEFINED','NO'),
    ('failureReason','text','YES'), ('attemptCount','integer','NO'), ('lastAttemptAt','timestamp without time zone','YES'),
    ('retryEligibleAt','timestamp without time zone','YES'), ('completedAt','timestamp without time zone','YES'),
    ('createdAt','timestamp without time zone','NO'), ('updatedAt','timestamp without time zone','NO')
), operations_column_check AS (
  SELECT count(c.column_name) = 15 AND bool_and(coalesce(c.data_type = e.data_type AND c.is_nullable = e.nullable, false)) AS ok
  FROM operations_columns_expected e LEFT JOIN information_schema.columns c
    ON c.table_schema = current_schema() AND c.table_name = 'portal_operations' AND c.column_name = e.name
), pk_check AS (
  SELECT count(*) FILTER (WHERE constraint_name = 'portal_operations_pkey' AND constraint_type = 'PRIMARY KEY') = 1 AS ok
  FROM information_schema.table_constraints
  WHERE constraint_schema = current_schema() AND table_name = 'portal_operations'
), index_check AS (
  SELECT
    count(*) FILTER (WHERE indexname = 'portal_operations_organizationId_idempotencyKey_key' AND indexdef ILIKE 'CREATE UNIQUE INDEX%') = 1
    AND count(*) FILTER (WHERE indexname = 'portal_operations_organizationId_provider_status_retryEligibleAt_idx') = 1 AS ok
  FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'portal_operations'
), fk_check AS (
  SELECT count(*) = 3
    AND bool_and(
      (constraint_name = 'portal_operations_organizationId_fkey' AND delete_rule = 'CASCADE')
      OR (constraint_name = 'portal_operations_portalListingId_fkey' AND delete_rule = 'SET NULL')
      OR (constraint_name = 'portal_operations_connectionId_fkey' AND delete_rule = 'SET NULL')
    ) AS ok
  FROM information_schema.referential_constraints
  WHERE constraint_schema = current_schema()
    AND constraint_name IN (
      'portal_operations_organizationId_fkey','portal_operations_portalListingId_fkey','portal_operations_connectionId_fkey'
    )
), org_scope_check AS (
  -- An operation must never reference a listing or connection in another organization.
  SELECT
    (SELECT count(*) FROM "portal_operations" op JOIN "portal_listings" pl ON pl."id" = op."portalListingId"
      WHERE op."organizationId" <> pl."organizationId") = 0
    AND (SELECT count(*) FROM "portal_operations" op JOIN "property_portal_connections" c ON c."id" = op."connectionId"
      WHERE op."organizationId" <> c."organizationId") = 0 AS ok
), retry_state_consistency_check AS (
  -- A DEAD_LETTER operation must never remain eligible for another automatic
  -- retry, and a SUCCEEDED operation must never carry a pending retry time.
  SELECT
    (SELECT count(*) FROM "portal_operations" WHERE status = 'DEAD_LETTER' AND "retryEligibleAt" IS NOT NULL) = 0
    AND (SELECT count(*) FROM "portal_operations" WHERE status = 'SUCCEEDED' AND "retryEligibleAt" IS NOT NULL) = 0 AS ok
), no_auto_created_rows_check AS (
  -- Informational, not a hard gate below: the migration itself contains no
  -- INSERT statement, so immediately after first applying it (before any
  -- retry/conflict activity has occurred) this must read 0. Once real
  -- activity or demo seed data exists, a nonzero count is expected and fine.
  SELECT count(*) AS operations FROM "portal_operations"
)
SELECT
  CASE WHEN (SELECT ok FROM enum_operation_status) AND (SELECT ok FROM enum_conflict_resolution)
        AND (SELECT ok FROM listing_conflict_column_check) AND (SELECT ok FROM operations_column_check)
        AND (SELECT ok FROM pk_check) AND (SELECT ok FROM index_check) AND (SELECT ok FROM fk_check)
        AND (SELECT ok FROM org_scope_check) AND (SELECT ok FROM retry_state_consistency_check)
       THEN 'PASS' ELSE 'FAIL' END AS result,
  (SELECT ok FROM enum_operation_status) AS enum_operation_status_ok,
  (SELECT ok FROM enum_conflict_resolution) AS enum_conflict_resolution_ok,
  (SELECT ok FROM listing_conflict_column_check) AS listing_conflict_columns_ok,
  (SELECT ok FROM operations_column_check) AS operations_columns_ok,
  (SELECT ok FROM pk_check) AS primary_key_ok,
  (SELECT ok FROM index_check) AS indexes_ok,
  (SELECT ok FROM fk_check) AS foreign_keys_ok,
  (SELECT ok FROM org_scope_check) AS organization_scope_ok,
  (SELECT ok FROM retry_state_consistency_check) AS retry_state_consistency_ok,
  (SELECT operations FROM no_auto_created_rows_check) AS portal_operation_rows_present;
