-- Read-only pre-migration baseline for the Housing.com lead-push webhook
-- release (external_lead_events.leadSnapshot). Takes no locks, performs no
-- writes. Run this BEFORE 2026-08-19-housing-lead-event-snapshot.sql and
-- save the single output row, then run it again AFTER migrating and diff:
-- (a) the leadSnapshot column now exists, (b) every existing
-- ExternalLeadEvent/Lead/CustomerContact fingerprint below is
-- byte-for-byte unchanged (this migration never touches those rows).
--
-- SAFETY: PostgreSQL resolves a bare column/type reference at PARSE time,
-- before any CASE/FILTER/EXISTS branch can protect it - so this file must
-- never reference "leadSnapshot" as a direct identifier. Its presence is
-- only ever probed through information_schema.
--
-- No raw phone/email/payload content is ever selected here - only counts
-- and opaque MD5 fingerprints.
--
-- Run this in the Supabase SQL Editor and save the single output row.

CREATE OR REPLACE FUNCTION pg_temp.__kp_table_count(reg text) RETURNS bigint AS $$
DECLARE
  result bigint;
BEGIN
  IF to_regclass(reg) IS NULL THEN
    RETURN 0;
  END IF;
  EXECUTE format('SELECT count(*) FROM %s', reg) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

WITH event_counts AS (
  SELECT
    (SELECT count(*) FROM "external_lead_events") AS total_external_lead_events,
    (SELECT count(*) FROM "external_lead_events" WHERE provider = 'HOUSING') AS housing_event_count
), lead_counts AS (
  SELECT count(*) AS total_leads FROM "leads"
), demand_pool_counts AS (
  SELECT pg_temp.__kp_table_count('public.customer_contacts') AS customer_contact_count
), schema_presence AS (
  SELECT
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'external_lead_events'
        AND column_name = 'leadSnapshot') AS lead_snapshot_column_present,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'external_lead_events') AS external_lead_events_column_count
), fingerprints AS (
  -- Aggregate MD5 checksums only - no name/phone/email/message or other
  -- personal data is ever returned, only a single opaque hash per entity.
  -- Built only from fields that exist on origin/main today, so expected to
  -- be IDENTICAL before and after this migration - proving it altered no
  -- pre-existing ExternalLeadEvent/Lead field on any existing row (it has
  -- zero DML).
  SELECT
    (SELECT md5(string_agg(
        id || '|' || "organizationId" || '|' || provider::text || '|' ||
        coalesce("externalEventId", '~') || '|' || "ingestionStatus"::text || '|' ||
        coalesce("leadId", '~') || '|' || "rawPayloadHash" || '|' || "createdAt"::text,
        ',' ORDER BY id))
     FROM "external_lead_events") AS external_lead_event_fields_fingerprint,
    (SELECT md5(string_agg(
        id || '|' || "organizationId" || '|' || source::text || '|' ||
        coalesce("portalProvider"::text, '~') || '|' || coalesce("externalLeadId", '~') || '|' ||
        "createdAt"::text,
        ',' ORDER BY id))
     FROM "leads") AS lead_business_fields_fingerprint
)
SELECT * FROM event_counts, lead_counts, demand_pool_counts, schema_presence, fingerprints;
