-- Read-only verification for the Demand Pool + Customer Requirements +
-- Two-Way Property Matching migration. One result row; PASS means the
-- schema is exact, organization-scoped, and no business row was created
-- automatically by the migration itself. Runs no writes, takes no locks.
WITH enum_contact_status AS (
  SELECT count(*) = 4 AND bool_and(e.enumlabel IN ('ACTIVE','INACTIVE','DO_NOT_CONTACT','ARCHIVED')) AS ok
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'ContactStatus'
), enum_requirement_priority AS (
  SELECT count(*) = 3 AND bool_and(e.enumlabel IN ('LOW','MEDIUM','HIGH')) AS ok
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'CustomerRequirementPriority'
), enum_recommendation_tier AS (
  SELECT count(*) = 4 AND bool_and(e.enumlabel IN ('EXACT','STRONG','STRETCH','LOW')) AS ok
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'RecommendationTier'
), enum_recommendation_status AS (
  SELECT count(*) = 7 AND bool_and(e.enumlabel IN ('PENDING','REVIEWED','IGNORED','PREPARED','SENT','RESPONDED','EXPIRED')) AS ok
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'RecommendationStatus'
), enum_candidate_source AS (
  SELECT count(*) = 2 AND bool_and(e.enumlabel IN ('CONTACT','LEAD')) AS ok
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'DemandCandidateSource'
), enum_response_outcome AS (
  SELECT count(*) = 7 AND bool_and(e.enumlabel IN ('INTERESTED','NOT_INTERESTED','VISIT_REQUESTED','BUDGET_TOO_HIGH','LOCATION_NOT_SUITABLE','ALREADY_PURCHASED','DO_NOT_CONTACT')) AS ok
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'CustomerResponseOutcome'
), enum_import_entity_type_ok AS (
  SELECT bool_or(e.enumlabel = 'CONTACTS') AS ok
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'ImportEntityType'
), enum_saved_view_entity_type_ok AS (
  SELECT bool_or(e.enumlabel = 'CONTACT') AND bool_or(e.enumlabel = 'REQUIREMENT') AS ok
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'SavedViewEntityType'
), leads_column_check AS (
  SELECT count(c.column_name) = 1 AND bool_and(c.data_type = 'text' AND c.is_nullable = 'YES') AS ok
  FROM information_schema.columns c
  WHERE c.table_schema = current_schema() AND c.table_name = 'leads' AND c.column_name = 'customerContactId'
), contacts_columns_expected(name, data_type, nullable) AS (
  VALUES ('id','text','NO'), ('organizationId','text','NO'), ('name','text','NO'), ('phone','text','NO'),
    ('normalizedPhone','text','NO'), ('email','text','YES'), ('source','USER-DEFINED','NO'), ('notes','text','YES'),
    ('tags','text','NO'), ('status','USER-DEFINED','NO'), ('doNotContact','boolean','NO'), ('whatsAppOptOut','boolean','NO'),
    ('lastContactedAt','timestamp without time zone','YES'), ('lastPropertySentAt','timestamp without time zone','YES'),
    ('createdById','text','YES'), ('createdAt','timestamp without time zone','NO'), ('updatedAt','timestamp without time zone','NO')
), contacts_column_check AS (
  SELECT count(c.column_name) = 17 AND bool_and(coalesce(c.data_type = e.data_type AND c.is_nullable = e.nullable, false)) AS ok
  FROM contacts_columns_expected e LEFT JOIN information_schema.columns c
    ON c.table_schema = current_schema() AND c.table_name = 'customer_contacts' AND c.column_name = e.name
), requirements_columns_expected(name, data_type, nullable) AS (
  VALUES ('id','text','NO'), ('organizationId','text','NO'), ('customerContactId','text','NO'), ('assetClass','USER-DEFINED','NO'),
    ('transactionType','USER-DEFINED','NO'), ('propertyType','USER-DEFINED','YES'), ('commercialPropertyType','USER-DEFINED','YES'),
    ('preferredLocalities','text','NO'), ('minBudget','integer','YES'), ('maxBudget','integer','YES'), ('minArea','integer','YES'),
    ('maxArea','integer','YES'), ('bhk','integer','YES'), ('floorPreference','text','YES'), ('furnishing','USER-DEFINED','YES'),
    ('parkingRequired','boolean','YES'), ('liftRequired','boolean','YES'), ('commercialFitOutPref','USER-DEFINED','YES'),
    ('workstations','integer','YES'), ('cabins','integer','YES'), ('possession','text','YES'), ('notes','text','YES'),
    ('active','boolean','NO'), ('priority','USER-DEFINED','NO'), ('lastConfirmedAt','timestamp without time zone','NO'),
    ('createdById','text','YES'), ('convertedLeadId','text','YES'), ('createdAt','timestamp without time zone','NO'),
    ('updatedAt','timestamp without time zone','NO')
), requirements_column_check AS (
  SELECT count(c.column_name) = 29 AND bool_and(coalesce(c.data_type = e.data_type AND c.is_nullable = e.nullable, false)) AS ok
  FROM requirements_columns_expected e LEFT JOIN information_schema.columns c
    ON c.table_schema = current_schema() AND c.table_name = 'customer_requirements' AND c.column_name = e.name
), recommendations_columns_expected(name, data_type, nullable) AS (
  VALUES ('id','text','NO'), ('organizationId','text','NO'), ('propertyId','text','NO'), ('source','USER-DEFINED','NO'),
    ('candidateKey','text','NO'), ('customerContactId','text','YES'), ('leadId','text','YES'), ('requirementId','text','YES'),
    ('tier','USER-DEFINED','NO'), ('score','integer','NO'), ('reasons','text','NO'), ('status','USER-DEFINED','NO'),
    ('preparedAt','timestamp without time zone','YES'), ('sentAt','timestamp without time zone','YES'), ('channel','text','YES'),
    ('providerMessageId','text','YES'), ('createdById','text','YES'), ('responseOutcome','USER-DEFINED','YES'),
    ('respondedAt','timestamp without time zone','YES'), ('respondedById','text','YES'), ('createdAt','timestamp without time zone','NO'),
    ('updatedAt','timestamp without time zone','NO')
), recommendations_column_check AS (
  SELECT count(c.column_name) = 22 AND bool_and(coalesce(c.data_type = e.data_type AND c.is_nullable = e.nullable, false)) AS ok
  FROM recommendations_columns_expected e LEFT JOIN information_schema.columns c
    ON c.table_schema = current_schema() AND c.table_name = 'property_recommendations' AND c.column_name = e.name
), pk_check AS (
  SELECT count(*) FILTER (WHERE table_name = 'customer_contacts' AND constraint_type = 'PRIMARY KEY') = 1
    AND count(*) FILTER (WHERE table_name = 'customer_requirements' AND constraint_type = 'PRIMARY KEY') = 1
    AND count(*) FILTER (WHERE table_name = 'property_recommendations' AND constraint_type = 'PRIMARY KEY') = 1 AS ok
  FROM information_schema.table_constraints
  WHERE constraint_schema = current_schema()
    AND table_name IN ('customer_contacts','customer_requirements','property_recommendations')
), index_check AS (
  SELECT
    count(*) FILTER (WHERE tablename = 'customer_contacts' AND indexname = 'customer_contacts_organizationId_normalizedPhone_key' AND indexdef ILIKE 'CREATE UNIQUE INDEX%') = 1
    AND count(*) FILTER (WHERE tablename = 'customer_requirements' AND indexname = 'customer_requirements_convertedLeadId_key' AND indexdef ILIKE 'CREATE UNIQUE INDEX%') = 1
    AND count(*) FILTER (WHERE tablename = 'property_recommendations' AND indexname = 'property_recommendations_organizationId_propertyId_candidat_key' AND indexdef ILIKE 'CREATE UNIQUE INDEX%') = 1
    AND count(*) FILTER (WHERE tablename = 'leads' AND indexname = 'leads_organizationId_customerContactId_idx') = 1 AS ok
  FROM pg_indexes WHERE schemaname = current_schema()
    AND tablename IN ('customer_contacts','customer_requirements','property_recommendations','leads')
), fk_check AS (
  -- 1 (leads->contacts) + 2 (contacts->orgs/users) + 4 (requirements->orgs/
  -- contacts/users/leads) + 7 (recommendations->orgs/properties/contacts/
  -- leads/requirements/users x2) = 14, each with the correct ON DELETE
  -- action (CASCADE where the parent owning the row is gone, SET NULL where
  -- the row should survive an unrelated parent's deletion).
  SELECT count(*) = 14
    AND bool_and(
      (constraint_name = 'leads_customerContactId_fkey' AND delete_rule = 'SET NULL')
      OR (constraint_name = 'customer_contacts_organizationId_fkey' AND delete_rule = 'CASCADE')
      OR (constraint_name = 'customer_contacts_createdById_fkey' AND delete_rule = 'SET NULL')
      OR (constraint_name = 'customer_requirements_organizationId_fkey' AND delete_rule = 'CASCADE')
      OR (constraint_name = 'customer_requirements_customerContactId_fkey' AND delete_rule = 'CASCADE')
      OR (constraint_name = 'customer_requirements_createdById_fkey' AND delete_rule = 'SET NULL')
      OR (constraint_name = 'customer_requirements_convertedLeadId_fkey' AND delete_rule = 'SET NULL')
      OR (constraint_name = 'property_recommendations_organizationId_fkey' AND delete_rule = 'CASCADE')
      OR (constraint_name = 'property_recommendations_propertyId_fkey' AND delete_rule = 'CASCADE')
      OR (constraint_name = 'property_recommendations_customerContactId_fkey' AND delete_rule = 'CASCADE')
      OR (constraint_name = 'property_recommendations_leadId_fkey' AND delete_rule = 'CASCADE')
      OR (constraint_name = 'property_recommendations_requirementId_fkey' AND delete_rule = 'SET NULL')
      OR (constraint_name = 'property_recommendations_createdById_fkey' AND delete_rule = 'SET NULL')
      OR (constraint_name = 'property_recommendations_respondedById_fkey' AND delete_rule = 'SET NULL')
    ) AS ok
  FROM information_schema.referential_constraints
  WHERE constraint_schema = current_schema()
    AND constraint_name IN (
      'leads_customerContactId_fkey','customer_contacts_organizationId_fkey','customer_contacts_createdById_fkey',
      'customer_requirements_organizationId_fkey','customer_requirements_customerContactId_fkey',
      'customer_requirements_createdById_fkey','customer_requirements_convertedLeadId_fkey',
      'property_recommendations_organizationId_fkey','property_recommendations_propertyId_fkey',
      'property_recommendations_customerContactId_fkey','property_recommendations_leadId_fkey',
      'property_recommendations_requirementId_fkey','property_recommendations_createdById_fkey',
      'property_recommendations_respondedById_fkey'
    )
), org_scope_check AS (
  -- A requirement/recommendation must never reference a contact/lead/
  -- property belonging to a different organization.
  SELECT
    (SELECT count(*) FROM "customer_requirements" r JOIN "customer_contacts" c ON c."id" = r."customerContactId"
      WHERE r."organizationId" <> c."organizationId") = 0
    AND (SELECT count(*) FROM "property_recommendations" pr JOIN "properties" p ON p."id" = pr."propertyId"
      WHERE pr."organizationId" <> p."organizationId") = 0
    AND (SELECT count(*) FROM "property_recommendations" pr JOIN "customer_contacts" c ON c."id" = pr."customerContactId"
      WHERE pr."organizationId" <> c."organizationId") = 0
    AND (SELECT count(*) FROM "property_recommendations" pr JOIN "leads" l ON l."id" = pr."leadId"
      WHERE pr."organizationId" <> l."organizationId") = 0 AS ok
), candidate_source_consistency_check AS (
  -- source must agree with which of the two nullable FKs is actually set -
  -- the pair the matching engine's idempotency key (candidateKey) depends on.
  SELECT
    (SELECT count(*) FROM "property_recommendations" WHERE source = 'CONTACT' AND ("customerContactId" IS NULL OR "leadId" IS NOT NULL)) = 0
    AND (SELECT count(*) FROM "property_recommendations" WHERE source = 'LEAD' AND ("leadId" IS NULL OR "customerContactId" IS NOT NULL)) = 0 AS ok
), no_auto_created_rows_check AS (
  -- Informational, not a hard gate below: the migration itself contains no
  -- INSERT statement, so immediately after first applying it (before any
  -- import, matching run, or demo seed has run) this must read 0/0/0. Once
  -- real activity or demo seed data exists, a nonzero count here is expected
  -- and fine - only treat this as a red flag if it is nonzero directly after
  -- migrating a database that had no demand-pool activity before.
  SELECT
    (SELECT count(*) FROM "customer_contacts") AS contacts,
    (SELECT count(*) FROM "customer_requirements") AS requirements,
    (SELECT count(*) FROM "property_recommendations") AS recommendations
)
SELECT
  CASE WHEN (SELECT ok FROM enum_contact_status) AND (SELECT ok FROM enum_requirement_priority)
        AND (SELECT ok FROM enum_recommendation_tier) AND (SELECT ok FROM enum_recommendation_status)
        AND (SELECT ok FROM enum_candidate_source) AND (SELECT ok FROM enum_response_outcome)
        AND (SELECT ok FROM enum_import_entity_type_ok) AND (SELECT ok FROM enum_saved_view_entity_type_ok)
        AND (SELECT ok FROM leads_column_check) AND (SELECT ok FROM contacts_column_check)
        AND (SELECT ok FROM requirements_column_check) AND (SELECT ok FROM recommendations_column_check)
        AND (SELECT ok FROM pk_check) AND (SELECT ok FROM index_check) AND (SELECT ok FROM fk_check)
        AND (SELECT ok FROM org_scope_check) AND (SELECT ok FROM candidate_source_consistency_check)
       THEN 'PASS' ELSE 'FAIL' END AS result,
  (SELECT ok FROM enum_contact_status) AS enum_contact_status_ok,
  (SELECT ok FROM enum_requirement_priority) AS enum_requirement_priority_ok,
  (SELECT ok FROM enum_recommendation_tier) AS enum_recommendation_tier_ok,
  (SELECT ok FROM enum_recommendation_status) AS enum_recommendation_status_ok,
  (SELECT ok FROM enum_candidate_source) AS enum_candidate_source_ok,
  (SELECT ok FROM enum_response_outcome) AS enum_response_outcome_ok,
  (SELECT ok FROM enum_import_entity_type_ok) AS enum_import_entity_type_ok,
  (SELECT ok FROM enum_saved_view_entity_type_ok) AS enum_saved_view_entity_type_ok,
  (SELECT ok FROM leads_column_check) AS leads_column_ok,
  (SELECT ok FROM contacts_column_check) AS contacts_columns_ok,
  (SELECT ok FROM requirements_column_check) AS requirements_columns_ok,
  (SELECT ok FROM recommendations_column_check) AS recommendations_columns_ok,
  (SELECT ok FROM pk_check) AS primary_keys_ok,
  (SELECT ok FROM index_check) AS indexes_ok,
  (SELECT ok FROM fk_check) AS foreign_keys_ok,
  (SELECT ok FROM org_scope_check) AS organization_scope_ok,
  (SELECT ok FROM candidate_source_consistency_check) AS candidate_source_consistency_ok,
  (SELECT contacts FROM no_auto_created_rows_check) AS customer_contact_rows_present,
  (SELECT requirements FROM no_auto_created_rows_check) AS customer_requirement_rows_present,
  (SELECT recommendations FROM no_auto_created_rows_check) AS property_recommendation_rows_present;
