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
    count(*)                                          AS total_properties,
    count(*) FILTER (WHERE "assetClass" = 'RESIDENTIAL') AS residential_properties,
    count(*) FILTER (WHERE "assetClass" = 'COMMERCIAL')  AS commercial_properties,
    count(*) FILTER (WHERE "listingType" = 'RENT')        AS rent_properties,
    count(*) FILTER (WHERE "listingType" = 'SALE')         AS sale_properties
  FROM "properties"
), lead_counts AS (
  SELECT
    count(*)                                            AS total_leads,
    count(*) FILTER (WHERE "assetClass" = 'RESIDENTIAL')   AS residential_leads,
    count(*) FILTER (WHERE "assetClass" = 'COMMERCIAL')    AS commercial_leads,
    count(*) FILTER (WHERE "transactionType" = 'RENT')     AS rent_leads,
    count(*) FILTER (WHERE "transactionType" = 'SALE')     AS sale_leads
  FROM "leads"
), related_counts AS (
  SELECT
    (SELECT count(*) FROM "catalogue_shares") AS catalogue_count,
    (SELECT count(*) FROM "visits")           AS visits_count,
    (SELECT count(*) FROM "deals")            AS deals_count
), portal_counts AS (
  SELECT
    pg_temp.__kp_table_count('public.property_portal_connections') AS portal_connection_count,
    pg_temp.__kp_table_count('public.portal_listings')             AS portal_listing_count,
    pg_temp.__kp_table_count('public.external_lead_events')        AS external_lead_event_count,
    pg_temp.__kp_table_count('public.portal_operations')           AS portal_operation_count
), schema_presence AS (
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
  -- entity. Re-running this after the migration and comparing these two
  -- strings proves every existing property and lead's business-critical
  -- fields (status, pricing, type, ownership/assignment) are byte-for-byte
  -- unchanged by the migration.
  SELECT
    (SELECT md5(string_agg(
        id || '|' || "organizationId" || '|' || "propertyType"::text || '|' || "listingType"::text || '|' ||
        "assetClass"::text || '|' || status::text || '|' || coalesce("monthlyRent"::text, '~') || '|' ||
        coalesce("salePrice"::text, '~') || '|' || coalesce(bhk::text, '~') || '|' || "createdAt"::text,
        ',' ORDER BY id))
     FROM "properties") AS properties_fingerprint,
    (SELECT md5(string_agg(
        id || '|' || "organizationId" || '|' || source::text || '|' || "assetClass"::text || '|' ||
        "transactionType"::text || '|' || "requirementType"::text || '|' || status::text || '|' ||
        "minBudget"::text || '|' || "maxBudget"::text || '|' || coalesce("assignedToId", '~') || '|' ||
        "createdAt"::text,
        ',' ORDER BY id))
     FROM "leads") AS leads_fingerprint
)
SELECT * FROM property_counts, lead_counts, related_counts, portal_counts, schema_presence, fingerprints;
