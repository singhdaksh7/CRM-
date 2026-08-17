-- Read-only verification for the Catalogue -> Visit -> Field Executive Visit
-- migration. One result row; PASS means the schema is exact AND the backfill
-- left no visit without a visit_properties row. Runs no writes, takes no
-- locks, and is safe against production.
WITH enum_visit_status AS (
  SELECT bool_or(e.enumlabel = 'IN_PROGRESS') AS ok
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
  WHERE t.typname = 'VisitStatus'
), enum_visit_property_status AS (
  SELECT count(*) = 5 AND bool_and(e.enumlabel IN ('PENDING','VISITED','SKIPPED','CLIENT_REJECTED','UNAVAILABLE')) AS ok
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
  WHERE t.typname = 'VisitPropertyStatus'
), visit_columns_expected(name, data_type, nullable) AS (
  VALUES ('catalogueShareId','text','YES'), ('createdById','text','YES'),
    ('startedAt','timestamp without time zone','YES'), ('completedAt','timestamp without time zone','YES'),
    ('overallRating','integer','YES'), ('completionSummary','text','YES'), ('cancellationReason','text','YES')
), visit_column_check AS (
  SELECT count(c.column_name) = 7 AND bool_and(coalesce(c.data_type = e.data_type AND c.is_nullable = e.nullable, false)) AS ok
  FROM visit_columns_expected e LEFT JOIN information_schema.columns c
    ON c.table_schema = current_schema() AND c.table_name = 'visits' AND c.column_name = e.name
), visit_property_id_still_required AS (
  -- Backwards compatibility guard: if this ever flips to YES, legacy readers
  -- of visit.property break. It must stay NOT NULL.
  SELECT count(*) = 1 AS ok
  FROM information_schema.columns
  WHERE table_schema = current_schema() AND table_name = 'visits' AND column_name = 'propertyId' AND is_nullable = 'NO'
), vp_columns_expected(name, data_type, nullable, expected_default) AS (
  VALUES ('id','text','NO',NULL), ('organizationId','text','NO','org_default'), ('visitId','text','NO',NULL),
    ('propertyId','text','NO',NULL), ('sequence','integer','NO','0'), ('status','USER-DEFINED','NO','PENDING'),
    ('visitedAt','timestamp without time zone','YES',NULL), ('visitedById','text','YES',NULL),
    ('reactionRating','integer','YES',NULL), ('reactionNote','text','YES',NULL), ('skipReason','text','YES',NULL),
    ('isPreferred','boolean','NO','false'), ('createdAt','timestamp without time zone','NO','CURRENT_TIMESTAMP'),
    ('updatedAt','timestamp without time zone','NO',NULL)
), vp_column_check AS (
  SELECT count(c.column_name) = 14 AND bool_and(coalesce(c.data_type = e.data_type AND c.is_nullable = e.nullable AND
    (e.expected_default IS NULL OR c.column_default ILIKE '%' || e.expected_default || '%'), false)) AS ok
  FROM vp_columns_expected e LEFT JOIN information_schema.columns c
    ON c.table_schema = current_schema() AND c.table_name = 'visit_properties' AND c.column_name = e.name
), pk_check AS (
  SELECT count(*) FILTER (WHERE constraint_name = 'visit_properties_pkey' AND constraint_type = 'PRIMARY KEY') = 1 AS ok
  FROM information_schema.table_constraints
  WHERE constraint_schema = current_schema() AND table_name = 'visit_properties'
), index_check AS (
  SELECT
    count(*) FILTER (WHERE indexname = 'visit_properties_visitId_propertyId_key' AND indexdef ILIKE 'CREATE UNIQUE INDEX%(%"visitId", "propertyId"%)') = 1
    AND count(*) FILTER (WHERE indexname = 'visit_properties_organizationId_propertyId_idx') = 1
    AND count(*) FILTER (WHERE indexname = 'visit_properties_visitId_sequence_idx') = 1 AS ok
  FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'visit_properties'
), visit_index_check AS (
  SELECT
    count(*) FILTER (WHERE indexname = 'visits_organizationId_visitDate_idx') = 1
    AND count(*) FILTER (WHERE indexname = 'visits_organizationId_assignedToId_visitDate_idx') = 1 AS ok
  FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'visits'
), fk_check AS (
  SELECT count(*) = 8 AS ok
  FROM information_schema.referential_constraints
  WHERE constraint_schema = current_schema()
    AND constraint_name IN ('visits_catalogueShareId_fkey','visits_createdById_fkey',
      'visit_properties_organizationId_fkey','visit_properties_visitId_fkey',
      'visit_properties_propertyId_fkey','visit_properties_visitedById_fkey',
      'catalogue_interactions_scheduledVisitId_fkey','catalogue_interactions_scheduledById_fkey')
), request_columns_expected(name, data_type, nullable) AS (
  -- The visit-REQUEST resolution columns. A client request must be able to
  -- record which confirmed visit consumed it - and must be able to be
  -- unresolved (NULL), which is what makes it a pending request.
  VALUES ('scheduledVisitId','text','YES'), ('scheduledAt','timestamp without time zone','YES'),
    ('scheduledById','text','YES')
), request_column_check AS (
  SELECT count(c.column_name) = 3 AND bool_and(coalesce(c.data_type = e.data_type AND c.is_nullable = e.nullable, false)) AS ok
  FROM request_columns_expected e LEFT JOIN information_schema.columns c
    ON c.table_schema = current_schema() AND c.table_name = 'catalogue_interactions' AND c.column_name = e.name
), request_index_check AS (
  SELECT count(*) FILTER (WHERE indexname = 'catalogue_interactions_organizationId_type_scheduledVisitId_idx') = 1 AS ok
  FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'catalogue_interactions'
), request_orphan_check AS (
  -- A resolved request must point at a visit that exists, in the same org.
  SELECT count(*) = 0 AS ok
  FROM "catalogue_interactions" ci
  WHERE ci."scheduledVisitId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "visits" v WHERE v."id" = ci."scheduledVisitId" AND v."organizationId" = ci."organizationId")
), backfill_check AS (
  -- Every visit must have at least one visit_properties row, otherwise the
  -- new detail view would render an empty property list for legacy data.
  SELECT count(*) = 0 AS ok
  FROM "visits" v
  WHERE NOT EXISTS (SELECT 1 FROM "visit_properties" vp WHERE vp."visitId" = v."id")
), rating_range_check AS (
  -- No star value outside 1-5 may ever be persisted.
  SELECT count(*) = 0 AS ok FROM "visit_properties" WHERE "reactionRating" IS NOT NULL AND ("reactionRating" < 1 OR "reactionRating" > 5)
), org_scope_check AS (
  -- A visit_properties row must never point at a visit in another organization.
  SELECT count(*) = 0 AS ok
  FROM "visit_properties" vp JOIN "visits" v ON v."id" = vp."visitId"
  WHERE vp."organizationId" <> v."organizationId"
)
SELECT
  CASE WHEN (SELECT ok FROM enum_visit_status)
        AND (SELECT ok FROM enum_visit_property_status)
        AND (SELECT ok FROM visit_column_check)
        AND (SELECT ok FROM visit_property_id_still_required)
        AND (SELECT ok FROM vp_column_check)
        AND (SELECT ok FROM pk_check)
        AND (SELECT ok FROM index_check)
        AND (SELECT ok FROM visit_index_check)
        AND (SELECT ok FROM fk_check)
        AND (SELECT ok FROM request_column_check)
        AND (SELECT ok FROM request_index_check)
        AND (SELECT ok FROM request_orphan_check)
        AND (SELECT ok FROM backfill_check)
        AND (SELECT ok FROM rating_range_check)
        AND (SELECT ok FROM org_scope_check)
       THEN 'PASS' ELSE 'FAIL' END AS result,
  (SELECT ok FROM enum_visit_status)             AS enum_in_progress_ok,
  (SELECT ok FROM enum_visit_property_status)    AS enum_visit_property_status_ok,
  (SELECT ok FROM visit_column_check)            AS visits_new_columns_ok,
  (SELECT ok FROM visit_property_id_still_required) AS visits_propertyid_still_not_null_ok,
  (SELECT ok FROM vp_column_check)               AS visit_properties_columns_ok,
  (SELECT ok FROM pk_check)                      AS visit_properties_pk_ok,
  (SELECT ok FROM index_check)                   AS visit_properties_indexes_ok,
  (SELECT ok FROM visit_index_check)             AS visits_indexes_ok,
  (SELECT ok FROM fk_check)                      AS foreign_keys_ok,
  (SELECT ok FROM request_column_check)          AS visit_request_columns_ok,
  (SELECT ok FROM request_index_check)           AS visit_request_index_ok,
  (SELECT ok FROM request_orphan_check)          AS visit_request_no_orphans_ok,
  (SELECT ok FROM backfill_check)                AS backfill_complete_ok,
  (SELECT ok FROM rating_range_check)            AS rating_range_ok,
  (SELECT ok FROM org_scope_check)               AS organization_scope_ok;
