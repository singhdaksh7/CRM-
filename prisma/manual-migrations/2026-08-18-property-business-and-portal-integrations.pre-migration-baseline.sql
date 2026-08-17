-- Read-only production pre-migration baseline for the Property Business &
-- Portal Integrations release. Takes no locks, performs no writes (the only
-- non-SELECT construct is a session-local pg_temp function used purely to
-- make table-existence checks safe to run both before AND after the
-- migration, without erroring when a table doesn't exist yet).
--
-- Purpose: capture the current state of business data (properties, leads,
-- catalogues, visits, deals) and confirm the portal/commercial schema is
-- absent BEFORE the manual migrations
-- (2026-08-17-property-business-portals.sql,
--  2026-08-17-portal-operations-conflicts.sql) run, so the same file can be
-- run again afterward and diffed to prove: (a) the new portal tables/columns
-- now exist, and (b) every existing property/lead business fingerprint is
-- byte-for-byte unchanged.
--
-- SAFETY: PostgreSQL resolves a bare column/type reference (e.g. "assetClass"
-- or a cast to ::"TransactionType") at PARSE time, before any CASE/FILTER/
-- EXISTS branch can protect it - so this file must never reference a column,
-- table, or type that this feature's migration introduces as a direct
-- identifier. New COLUMNS on the pre-existing "properties"/"leads" tables are
-- read via to_jsonb(row)->>'columnName', which returns NULL for an absent key
-- instead of erroring. New TABLES are only ever probed through
-- information_schema/pg_catalog or the dynamic-EXECUTE helper below. New
-- ENUM TYPES are only ever looked up by name in pg_type, never cast to.
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

WITH property_counts AS (
  SELECT
    count(*)                                                                AS total_properties,
    -- "assetClass" does not exist pre-migration; to_jsonb(p)->>'assetClass'
    -- is NULL in that case (no match, no error) rather than a parse failure.
    count(*) FILTER (WHERE to_jsonb(p)->>'assetClass' = 'RESIDENTIAL')        AS residential_properties,
    count(*) FILTER (WHERE to_jsonb(p)->>'assetClass' = 'COMMERCIAL')         AS commercial_properties,
    -- "listingType" is a pre-existing column on origin/main, untouched by
    -- this feature's migration, so a direct reference is safe both before
    -- and after.
    count(*) FILTER (WHERE p."listingType" = 'RENT')                          AS rent_properties,
    count(*) FILTER (WHERE p."listingType" = 'SALE')                          AS sale_properties
  FROM "properties" p
), lead_counts AS (
  SELECT
    count(*)                                                                AS total_leads,
    -- "assetClass"/"transactionType" do not exist pre-migration; NULL, not
    -- an error, and the resulting 0 counts pre-migration are expected.
    count(*) FILTER (WHERE to_jsonb(l)->>'assetClass' = 'RESIDENTIAL')        AS residential_leads,
    count(*) FILTER (WHERE to_jsonb(l)->>'assetClass' = 'COMMERCIAL')         AS commercial_leads,
    count(*) FILTER (WHERE to_jsonb(l)->>'transactionType' = 'RENT')          AS rent_leads,
    count(*) FILTER (WHERE to_jsonb(l)->>'transactionType' = 'SALE')          AS sale_leads
  FROM "leads" l
), related_counts AS (
  SELECT
    (SELECT count(*) FROM "catalogue_shares") AS catalogues,
    (SELECT count(*) FROM "visits")           AS visits,
    (SELECT count(*) FROM "deals")            AS deals
), portal_counts AS (
  SELECT
    pg_temp.__kp_table_count('public.property_portal_connections') AS portal_connection_count,
    pg_temp.__kp_table_count('public.portal_listings')             AS portal_listing_count,
    pg_temp.__kp_table_count('public.external_lead_events')        AS external_portal_lead_event_count,
    pg_temp.__kp_table_count('public.portal_operations')           AS portal_operation_count
), schema_presence AS (
  -- information_schema/pg_catalog lookups never error on an absent
  -- table/column/type - an absent one is simply not among the matched rows.
  SELECT
    (to_regclass('public.property_portal_connections') IS NOT NULL
      AND to_regclass('public.portal_listings') IS NOT NULL
      AND to_regclass('public.external_lead_events') IS NOT NULL
      AND to_regclass('public.portal_operations') IS NOT NULL)              AS portal_tables_exist,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'properties'
        AND column_name IN (
          'assetClass','superAreaSqft','frontageFeet','ceilingHeightFeet','cabins',
          'workstations','washrooms','pantryAvailable','powerLoadKw','commercialFitOut',
          'goodsLiftAvailable','loadingAccessAvailable','roadWidthFeet','cornerProperty',
          'fireSafetyAvailable','suitableForTags','leaseTermMonths','lockInPeriodMonths',
          'noticePeriodMonths','escalationPercentage','escalationIntervalMonths',
          'fitOutPeriodDays','camCharge','expectedPrice','ownershipTitleNotes'
        ))                                                                  AS commercial_property_columns_present,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'leads'
        AND column_name IN (
          'assetClass','transactionType','portalProvider','externalListingId',
          'rawPayloadHash','receivedAt','commercialPropertyType','minAreaSqft',
          'maxAreaSqft','floorPreference','commercialFitOutPref','parkingRequired',
          'liftRequired','suitableForTags'
        ))                                                                  AS commercial_lead_columns_present,
    (SELECT count(*) FROM pg_type
      WHERE typname IN (
        'AssetClass','TransactionType','CommercialFitOut','PropertyPortalProvider',
        'PortalConnectionStatus','PortalConnectionMode','PortalListingStatus',
        'PortalIngestionStatus','PortalCapabilityStatus','PortalOperationStatus',
        'PortalConflictResolution'
      ))                                                                    AS portal_enum_count
), fingerprints AS (
  -- Aggregate MD5 checksums only - no address, name, phone, email, or other
  -- personal/credential data is ever returned, only a single opaque hash per
  -- entity. Deliberately built ONLY from fields that already exist on
  -- origin/main today (id, organizationId, propertyType, listingType,
  -- status, pricing, bhk / source, requirementType, status, budget,
  -- assignment, createdAt) - "assetClass"/"transactionType" and every other
  -- new column are excluded on purpose, so this fingerprint is expected to
  -- be IDENTICAL before and after the migration (unlike the segmentation
  -- counts above, which are expected to change). Re-running this file after
  -- the migration and comparing these two strings proves the migration
  -- altered no pre-existing business field on any existing row.
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
SELECT * FROM property_counts, lead_counts, related_counts, portal_counts, schema_presence, fingerprints;
