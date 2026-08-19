-- Read-only pre-migration baseline for the Demand Pool + Customer
-- Requirements + Two-Way Property Matching release. Takes no locks,
-- performs no writes. Run this BEFORE 2026-08-19-demand-pool-matching.sql
-- and save the single output row, then run it again AFTER migrating and
-- diff: (a) the new demand-pool tables/columns now exist, (b) every
-- existing Lead/Property/Catalogue/Visit business fingerprint below is
-- byte-for-byte unchanged (this migration never touches those rows).
--
-- SAFETY: PostgreSQL resolves a bare column/type reference at PARSE time,
-- before any CASE/FILTER/EXISTS branch can protect it - so this file must
-- never reference a column, table, or type this migration introduces as a
-- direct identifier. New TABLES/ENUM TYPES are only ever probed through
-- information_schema/pg_catalog or the dynamic-EXECUTE helper below.
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

WITH lead_counts AS (
  SELECT count(*) AS total_leads FROM "leads"
), property_counts AS (
  SELECT count(*) AS total_properties FROM "properties"
), related_counts AS (
  SELECT
    (SELECT count(*) FROM "catalogue_shares") AS catalogues,
    (SELECT count(*) FROM "visits")           AS visits,
    (SELECT count(*) FROM "deals")            AS deals
), demand_pool_counts AS (
  SELECT
    pg_temp.__kp_table_count('public.customer_contacts')       AS customer_contact_count,
    pg_temp.__kp_table_count('public.customer_requirements')   AS customer_requirement_count,
    pg_temp.__kp_table_count('public.property_recommendations') AS property_recommendation_count
), schema_presence AS (
  SELECT
    (to_regclass('public.customer_contacts') IS NOT NULL
      AND to_regclass('public.customer_requirements') IS NOT NULL
      AND to_regclass('public.property_recommendations') IS NOT NULL) AS demand_pool_tables_exist,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'leads' AND column_name = 'customerContactId') AS lead_customer_contact_column_present,
    (SELECT count(*) FROM pg_type
      WHERE typname IN (
        'ContactStatus','CustomerRequirementPriority','RecommendationTier','RecommendationStatus',
        'DemandCandidateSource','CustomerResponseOutcome'
      )) AS demand_pool_enum_count
), fingerprints AS (
  -- Aggregate MD5 checksums only - no name/phone/email/notes or other
  -- personal data is ever returned, only a single opaque hash per entity.
  -- Built only from fields that exist on origin/main today, so expected to
  -- be IDENTICAL before and after this migration - proving it altered no
  -- pre-existing Lead/Property field on any existing row (it has zero DML).
  SELECT
    (SELECT md5(string_agg(
        id || '|' || "organizationId" || '|' || "propertyType"::text || '|' || "listingType"::text || '|' ||
        status::text || '|' || coalesce("monthlyRent"::text, '~') || '|' ||
        coalesce("salePrice"::text, '~') || '|' || coalesce(bhk::text, '~') || '|' || "createdAt"::text,
        ',' ORDER BY id))
     FROM "properties") AS property_business_fields_fingerprint,
    (SELECT md5(string_agg(
        id || '|' || "organizationId" || '|' || source::text || '|' || "requirementType"::text || '|' ||
        status::text || '|' || "minBudget"::text || '|' || "maxBudget"::text || '|' || coalesce("assignedToId", '~') || '|' ||
        "createdAt"::text,
        ',' ORDER BY id))
     FROM "leads") AS lead_business_fields_fingerprint
)
SELECT * FROM lead_counts, property_counts, related_counts, demand_pool_counts, schema_presence, fingerprints;
