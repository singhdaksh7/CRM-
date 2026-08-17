-- Read-only production pre-migration baseline for the Catalogue -> Visit
-- Scheduling -> Field Executive Visit release. Takes no locks, performs no
-- writes.
--
-- Purpose: capture the current state of `visits` and `catalogue_interactions`
-- BEFORE the manual migration (2026-08-17-catalogue-visit-workflow.sql) runs,
-- so the same queries can be run again afterward and diffed to prove the
-- migration added the new columns/table and changed nothing else.
--
-- Expected BEFORE the migration:
--   * visit_properties_table_exists            = false
--   * visit_new_columns_present                = 0   (none of the 7 exist yet)
--   * catalogue_interaction_new_columns_present = 0  (none of the 3 exist yet)
--   * visit_status_in_progress_exists          = false
--
-- Expected AFTER the migration, re-running this same file:
--   * visit_properties_table_exists            = true
--   * visit_new_columns_present                = 7
--   * catalogue_interaction_new_columns_present = 3
--   * visit_status_in_progress_exists          = true
--   * total_visits and every per-status count  = UNCHANGED
--   * business_fields_fingerprint              = UNCHANGED (byte for byte)
--   * null_property_count                      = 0, still
--
-- Run this in the Supabase SQL Editor and save the single output row.

WITH visit_counts AS (
  SELECT
    count(*)                                              AS total_visits,
    count(*) FILTER (WHERE status = 'SCHEDULED')          AS scheduled_count,
    count(*) FILTER (WHERE status = 'CONFIRMED')          AS confirmed_count,
    count(*) FILTER (WHERE status = 'CLIENT_REACHED')     AS client_reached_count,
    count(*) FILTER (WHERE status = 'EMPLOYEE_REACHED')   AS employee_reached_count,
    count(*) FILTER (WHERE status = 'COMPLETED')          AS completed_count,
    count(*) FILTER (WHERE status = 'RESCHEDULED')        AS rescheduled_count,
    count(*) FILTER (WHERE status = 'CANCELLED')          AS cancelled_count,
    count(*) FILTER (WHERE status = 'CLIENT_NO_SHOW')     AS client_no_show_count,
    -- Must be 0 both before and after: "visits"."propertyId" stays NOT NULL
    -- so every legacy reader of visit.property keeps working.
    count(*) FILTER (WHERE "propertyId" IS NULL)          AS null_property_count,
    count(DISTINCT "organizationId")                      AS organization_count
  FROM "visits"
), request_counts AS (
  SELECT
    count(*)                                              AS catalogue_interaction_rows,
    count(*) FILTER (WHERE type = 'VISIT_REQUESTED')      AS visit_request_rows
  FROM "catalogue_interactions"
), schema_presence AS (
  SELECT
    to_regclass('public.visit_properties') IS NOT NULL AS visit_properties_table_exists,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'visits'
        AND column_name IN ('catalogueShareId','createdById','startedAt','completedAt',
                            'overallRating','completionSummary','cancellationReason'))
                                                       AS visit_new_columns_present,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'catalogue_interactions'
        AND column_name IN ('scheduledVisitId','scheduledAt','scheduledById'))
                                                       AS catalogue_interaction_new_columns_present,
    EXISTS (
      SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'VisitStatus' AND e.enumlabel = 'IN_PROGRESS'
    )                                                  AS visit_status_in_progress_exists,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'visits'
        AND column_name = 'propertyId' AND is_nullable = 'NO'
    )                                                  AS visits_propertyid_not_null
), fingerprint AS (
  -- Aggregate MD5 checksum only - no per-row data and no client-identifying
  -- values are returned. Re-running this after the migration and comparing
  -- this single string proves every existing visit's business fields are
  -- byte-for-byte unchanged.
  SELECT md5(string_agg(
    id || '|' || "organizationId" || '|' || "leadId" || '|' || "propertyId" || '|' ||
    coalesce("assignedToId", '~') || '|' || "visitDate"::text || '|' || "visitTime" || '|' ||
    status::text || '|' || coalesce(outcome::text, '~') || '|' ||
    coalesce("meetingLocation", '~') || '|' || coalesce("clientFeedback", '~') || '|' ||
    coalesce("employeeNotes", '~') || '|' || coalesce("followUpAction", '~') || '|' ||
    "routeSource"::text || '|' || "conflictStatus"::text || '|' || "createdAt"::text,
    ',' ORDER BY id)) AS business_fields_fingerprint
  FROM "visits"
)
SELECT * FROM visit_counts, request_counts, schema_presence, fingerprint;
