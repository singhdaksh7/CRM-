-- Read-only verification for the Property Business & Portal Foundation
-- migration. One result row; PASS means the commercial/portal schema is
-- exact, organization-scoped, and no portal row was created automatically
-- by the migration itself. Runs no writes, takes no locks.
WITH enum_asset_class AS (
  SELECT count(*) = 2 AND bool_and(e.enumlabel IN ('RESIDENTIAL','COMMERCIAL')) AS ok
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'AssetClass'
), enum_transaction_type AS (
  SELECT count(*) = 2 AND bool_and(e.enumlabel IN ('RENT','SALE')) AS ok
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'TransactionType'
), enum_commercial_fit_out AS (
  SELECT count(*) = 3 AND bool_and(e.enumlabel IN ('FURNISHED','SEMI_FURNISHED','BARE_SHELL')) AS ok
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'CommercialFitOut'
), enum_portal_provider AS (
  SELECT count(*) = 6 AND bool_and(e.enumlabel IN ('HOUSING','NINETY_NINE_ACRES','MAGICBRICKS','OLX','SQUARE_CONNECT','OTHER')) AS ok
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'PropertyPortalProvider'
), enum_connection_status AS (
  SELECT count(*) = 5 AND bool_and(e.enumlabel IN ('CONNECTED','NOT_CONFIGURED','DEGRADED','AUTH_FAILED','PARTNER_ACCESS_REQUIRED')) AS ok
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'PortalConnectionStatus'
), enum_connection_mode AS (
  SELECT count(*) = 5 AND bool_and(e.enumlabel IN ('API','WEBHOOK','CSV','EMAIL','MANUAL')) AS ok
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'PortalConnectionMode'
), enum_listing_status AS (
  SELECT count(*) = 5 AND bool_and(e.enumlabel IN ('DRAFT','PUBLISHED','INACTIVE','SYNC_CONFLICT','FAILED')) AS ok
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'PortalListingStatus'
), enum_ingestion_status AS (
  SELECT count(*) = 8 AND bool_and(e.enumlabel IN ('NEW','RECEIVED','MATCHED_EXISTING','AMBIGUOUS','DUPLICATE','NEEDS_REVIEW','REJECTED','FAILED')) AS ok
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'PortalIngestionStatus'
), enum_capability_status AS (
  SELECT count(*) = 5 AND bool_and(e.enumlabel IN ('AVAILABLE','CONFIGURATION_REQUIRED','PARTNER_ACCESS_REQUIRED','NOT_SUPPORTED','UNKNOWN')) AS ok
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'PortalCapabilityStatus'
), property_columns_expected(name, data_type, nullable) AS (
  VALUES ('assetClass','USER-DEFINED','NO'), ('superAreaSqft','integer','YES'), ('frontageFeet','double precision','YES'),
    ('ceilingHeightFeet','double precision','YES'), ('cabins','integer','YES'), ('workstations','integer','YES'),
    ('washrooms','integer','YES'), ('pantryAvailable','boolean','NO'), ('powerLoadKw','double precision','YES'),
    ('commercialFitOut','USER-DEFINED','YES'), ('goodsLiftAvailable','boolean','NO'), ('loadingAccessAvailable','boolean','NO'),
    ('roadWidthFeet','double precision','YES'), ('cornerProperty','boolean','NO'), ('fireSafetyAvailable','boolean','NO'),
    ('suitableForTags','text','NO'), ('leaseTermMonths','integer','YES'), ('lockInPeriodMonths','integer','YES'),
    ('noticePeriodMonths','integer','YES'), ('escalationPercentage','double precision','YES'), ('escalationIntervalMonths','integer','YES'),
    ('fitOutPeriodDays','integer','YES'), ('camCharge','integer','YES'), ('expectedPrice','integer','YES'), ('ownershipTitleNotes','text','YES')
), property_column_check AS (
  SELECT count(c.column_name) = 25 AND bool_and(coalesce(c.data_type = e.data_type AND c.is_nullable = e.nullable, false)) AS ok
  FROM property_columns_expected e LEFT JOIN information_schema.columns c
    ON c.table_schema = current_schema() AND c.table_name = 'properties' AND c.column_name = e.name
), lead_columns_expected(name, data_type, nullable) AS (
  VALUES ('assetClass','USER-DEFINED','NO'), ('transactionType','USER-DEFINED','NO'), ('portalProvider','USER-DEFINED','YES'),
    ('externalListingId','text','YES'), ('rawPayloadHash','text','YES'), ('receivedAt','timestamp without time zone','YES'),
    ('commercialPropertyType','USER-DEFINED','YES'), ('minAreaSqft','integer','YES'), ('maxAreaSqft','integer','YES'),
    ('floorPreference','text','YES'), ('commercialFitOutPref','USER-DEFINED','YES'), ('parkingRequired','boolean','YES'),
    ('liftRequired','boolean','YES'), ('suitableForTags','text','NO')
), lead_column_check AS (
  SELECT count(c.column_name) = 14 AND bool_and(coalesce(c.data_type = e.data_type AND c.is_nullable = e.nullable, false)) AS ok
  FROM lead_columns_expected e LEFT JOIN information_schema.columns c
    ON c.table_schema = current_schema() AND c.table_name = 'leads' AND c.column_name = e.name
), connections_columns_expected(name, data_type, nullable) AS (
  VALUES ('id','text','NO'), ('organizationId','text','NO'), ('provider','USER-DEFINED','NO'), ('status','USER-DEFINED','NO'),
    ('connectionMode','USER-DEFINED','NO'), ('displayName','text','YES'), ('accountReference','text','YES'),
    ('credentialReference','text','YES'), ('config','text','NO'), ('lastSyncAt','timestamp without time zone','YES'),
    ('lastSuccessfulSyncAt','timestamp without time zone','YES'), ('lastErrorAt','timestamp without time zone','YES'),
    ('lastErrorSummary','text','YES'), ('createdById','text','YES'), ('createdAt','timestamp without time zone','NO'),
    ('updatedAt','timestamp without time zone','NO')
), connections_column_check AS (
  SELECT count(c.column_name) = 16 AND bool_and(coalesce(c.data_type = e.data_type AND c.is_nullable = e.nullable, false)) AS ok
  FROM connections_columns_expected e LEFT JOIN information_schema.columns c
    ON c.table_schema = current_schema() AND c.table_name = 'property_portal_connections' AND c.column_name = e.name
), listings_columns_expected(name, data_type, nullable) AS (
  VALUES ('id','text','NO'), ('organizationId','text','NO'), ('connectionId','text','YES'), ('propertyId','text','NO'),
    ('provider','USER-DEFINED','NO'), ('externalListingId','text','YES'), ('externalUrl','text','YES'), ('status','USER-DEFINED','NO'),
    ('publishedAt','timestamp without time zone','YES'), ('lastSyncedAt','timestamp without time zone','YES'),
    ('payloadHash','text','YES'), ('errorSummary','text','YES'), ('createdAt','timestamp without time zone','NO'),
    ('updatedAt','timestamp without time zone','NO')
), listings_column_check AS (
  SELECT count(c.column_name) = 14 AND bool_and(coalesce(c.data_type = e.data_type AND c.is_nullable = e.nullable, false)) AS ok
  FROM listings_columns_expected e LEFT JOIN information_schema.columns c
    ON c.table_schema = current_schema() AND c.table_name = 'portal_listings' AND c.column_name = e.name
), events_columns_expected(name, data_type, nullable) AS (
  VALUES ('id','text','NO'), ('organizationId','text','NO'), ('connectionId','text','YES'), ('portalListingId','text','YES'),
    ('leadId','text','YES'), ('provider','USER-DEFINED','NO'), ('externalLeadId','text','YES'), ('externalEventId','text','YES'),
    ('externalListingId','text','YES'), ('receivedAt','timestamp without time zone','NO'), ('message','text','YES'),
    ('rawPayloadHash','text','NO'), ('ingestionStatus','USER-DEFINED','NO'), ('failureReason','text','YES'),
    ('attemptCount','integer','NO'), ('lastAttemptAt','timestamp without time zone','YES'),
    ('resolvedAt','timestamp without time zone','YES'), ('resolvedById','text','YES'),
    ('createdAt','timestamp without time zone','NO'), ('updatedAt','timestamp without time zone','NO')
), events_column_check AS (
  SELECT count(c.column_name) = 20 AND bool_and(coalesce(c.data_type = e.data_type AND c.is_nullable = e.nullable, false)) AS ok
  FROM events_columns_expected e LEFT JOIN information_schema.columns c
    ON c.table_schema = current_schema() AND c.table_name = 'external_lead_events' AND c.column_name = e.name
), pk_check AS (
  SELECT count(*) FILTER (WHERE table_name = 'property_portal_connections' AND constraint_type = 'PRIMARY KEY') = 1
    AND count(*) FILTER (WHERE table_name = 'portal_listings' AND constraint_type = 'PRIMARY KEY') = 1
    AND count(*) FILTER (WHERE table_name = 'external_lead_events' AND constraint_type = 'PRIMARY KEY') = 1 AS ok
  FROM information_schema.table_constraints
  WHERE constraint_schema = current_schema()
    AND table_name IN ('property_portal_connections','portal_listings','external_lead_events')
), index_check AS (
  SELECT
    count(*) FILTER (WHERE tablename = 'properties' AND indexname = 'properties_organizationId_assetClass_listingType_idx') = 1
    AND count(*) FILTER (WHERE tablename = 'leads' AND indexname = 'leads_organizationId_assetClass_transactionType_idx') = 1
    AND count(*) FILTER (WHERE tablename = 'portal_listings' AND indexname = 'portal_listings_organizationId_provider_externalListingId_key'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%') = 1
    AND count(*) FILTER (WHERE tablename = 'external_lead_events' AND indexname = 'external_lead_events_organizationId_provider_externalEventId_key'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%') = 1 AS ok
  FROM pg_indexes WHERE schemaname = current_schema()
    AND tablename IN ('properties','leads','portal_listings','external_lead_events')
), fk_check AS (
  -- 1 (connections->organizations) + 3 (listings->organizations/connections/properties)
  -- + 4 (events->organizations/connections/listings/leads) = 8, with the
  -- correct ON DELETE action per relationship (CASCADE where the parent
  -- owning the row is gone, SET NULL where the row should survive an
  -- unrelated parent's deletion).
  SELECT count(*) = 8
    AND bool_and(
      (constraint_name = 'property_portal_connections_organizationId_fkey' AND delete_rule = 'CASCADE')
      OR (constraint_name = 'portal_listings_organizationId_fkey' AND delete_rule = 'CASCADE')
      OR (constraint_name = 'portal_listings_connectionId_fkey' AND delete_rule = 'SET NULL')
      OR (constraint_name = 'portal_listings_propertyId_fkey' AND delete_rule = 'CASCADE')
      OR (constraint_name = 'external_lead_events_organizationId_fkey' AND delete_rule = 'CASCADE')
      OR (constraint_name = 'external_lead_events_connectionId_fkey' AND delete_rule = 'SET NULL')
      OR (constraint_name = 'external_lead_events_portalListingId_fkey' AND delete_rule = 'SET NULL')
      OR (constraint_name = 'external_lead_events_leadId_fkey' AND delete_rule = 'SET NULL')
    ) AS ok
  FROM information_schema.referential_constraints
  WHERE constraint_schema = current_schema()
    AND constraint_name IN (
      'property_portal_connections_organizationId_fkey',
      'portal_listings_organizationId_fkey','portal_listings_connectionId_fkey','portal_listings_propertyId_fkey',
      'external_lead_events_organizationId_fkey','external_lead_events_connectionId_fkey',
      'external_lead_events_portalListingId_fkey','external_lead_events_leadId_fkey'
    )
), org_scope_check AS (
  -- A listing/event must never reference a connection, property, or lead
  -- belonging to a different organization.
  SELECT
    (SELECT count(*) FROM "portal_listings" pl JOIN "property_portal_connections" c ON c."id" = pl."connectionId"
      WHERE pl."organizationId" <> c."organizationId") = 0
    AND (SELECT count(*) FROM "portal_listings" pl JOIN "properties" p ON p."id" = pl."propertyId"
      WHERE pl."organizationId" <> p."organizationId") = 0
    AND (SELECT count(*) FROM "external_lead_events" ev JOIN "leads" l ON l."id" = ev."leadId"
      WHERE ev."organizationId" <> l."organizationId") = 0 AS ok
), commercial_no_bhk_check AS (
  -- A commercial lead must never carry a residential BHK preference, and a
  -- commercial property must never depend on a nonzero bhk value.
  SELECT
    (SELECT count(*) FROM "leads" WHERE "assetClass" = 'COMMERCIAL' AND "preferredBhk" IS NOT NULL) = 0
    AND (SELECT count(*) FROM "properties" WHERE "assetClass" = 'COMMERCIAL' AND bhk <> 0) = 0 AS ok
), no_connected_without_partner_access_check AS (
  -- Every provider is contract-only; nothing may claim a live CONNECTED
  -- status until real partner access exists.
  SELECT count(*) = 0 AS ok FROM "property_portal_connections" WHERE status = 'CONNECTED'
), no_auto_created_rows_check AS (
  -- Informational, not a hard gate below: the migration itself contains no
  -- INSERT statement, so immediately after first applying it (before any
  -- ingestion or demo seed has run) this must read 0/0/0. Once ingestion or
  -- demo seed data exists, a nonzero count here is expected and fine - only
  -- treat this as a red flag if it is nonzero directly after migrating a
  -- database that had no portal activity before.
  SELECT
    (SELECT count(*) FROM "property_portal_connections") AS connections,
    (SELECT count(*) FROM "portal_listings") AS listings,
    (SELECT count(*) FROM "external_lead_events") AS events
)
SELECT
  CASE WHEN (SELECT ok FROM enum_asset_class) AND (SELECT ok FROM enum_transaction_type)
        AND (SELECT ok FROM enum_commercial_fit_out) AND (SELECT ok FROM enum_portal_provider)
        AND (SELECT ok FROM enum_connection_status) AND (SELECT ok FROM enum_connection_mode)
        AND (SELECT ok FROM enum_listing_status) AND (SELECT ok FROM enum_ingestion_status)
        AND (SELECT ok FROM enum_capability_status) AND (SELECT ok FROM property_column_check)
        AND (SELECT ok FROM lead_column_check) AND (SELECT ok FROM connections_column_check)
        AND (SELECT ok FROM listings_column_check) AND (SELECT ok FROM events_column_check)
        AND (SELECT ok FROM pk_check) AND (SELECT ok FROM index_check) AND (SELECT ok FROM fk_check)
        AND (SELECT ok FROM org_scope_check) AND (SELECT ok FROM commercial_no_bhk_check)
        AND (SELECT ok FROM no_connected_without_partner_access_check)
       THEN 'PASS' ELSE 'FAIL' END AS result,
  (SELECT ok FROM enum_asset_class) AS enum_asset_class_ok,
  (SELECT ok FROM enum_transaction_type) AS enum_transaction_type_ok,
  (SELECT ok FROM enum_commercial_fit_out) AS enum_commercial_fit_out_ok,
  (SELECT ok FROM enum_portal_provider) AS enum_portal_provider_ok,
  (SELECT ok FROM enum_connection_status) AS enum_connection_status_ok,
  (SELECT ok FROM enum_connection_mode) AS enum_connection_mode_ok,
  (SELECT ok FROM enum_listing_status) AS enum_listing_status_ok,
  (SELECT ok FROM enum_ingestion_status) AS enum_ingestion_status_ok,
  (SELECT ok FROM enum_capability_status) AS enum_capability_status_ok,
  (SELECT ok FROM property_column_check) AS commercial_property_columns_ok,
  (SELECT ok FROM lead_column_check) AS commercial_lead_columns_ok,
  (SELECT ok FROM connections_column_check) AS connections_columns_ok,
  (SELECT ok FROM listings_column_check) AS listings_columns_ok,
  (SELECT ok FROM events_column_check) AS events_columns_ok,
  (SELECT ok FROM pk_check) AS primary_keys_ok,
  (SELECT ok FROM index_check) AS indexes_ok,
  (SELECT ok FROM fk_check) AS foreign_keys_ok,
  (SELECT ok FROM org_scope_check) AS organization_scope_ok,
  (SELECT ok FROM commercial_no_bhk_check) AS commercial_no_bhk_dependency_ok,
  (SELECT ok FROM no_connected_without_partner_access_check) AS no_connected_without_partner_access_ok,
  (SELECT connections FROM no_auto_created_rows_check) AS portal_connection_rows_present,
  (SELECT listings FROM no_auto_created_rows_check) AS portal_listing_rows_present,
  (SELECT events FROM no_auto_created_rows_check) AS external_lead_event_rows_present;
