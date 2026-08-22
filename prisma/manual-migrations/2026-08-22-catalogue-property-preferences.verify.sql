-- Read-only verification for CataloguePropertyPreference migration.
WITH enum_ok AS (
  SELECT count(*) = 3 AND bool_and(e.enumlabel IN ('UNDECIDED','LIKED','NOT_INTERESTED')) AS ok
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'CataloguePropertyPreferenceStatus'
), columns_expected(name, data_type, nullable) AS (
  VALUES
    ('id','text','NO'),
    ('organizationId','text','NO'),
    ('catalogueShareId','text','NO'),
    ('propertyId','text','NO'),
    ('leadId','text','NO'),
    ('status','USER-DEFINED','NO'),
    ('note','text','YES'),
    ('respondedAt','timestamp without time zone','YES'),
    ('createdAt','timestamp without time zone','NO'),
    ('updatedAt','timestamp without time zone','NO')
), columns_ok AS (
  SELECT count(c.column_name) = 10 AND bool_and(coalesce(c.data_type = e.data_type AND c.is_nullable = e.nullable, false)) AS ok
  FROM columns_expected e
  LEFT JOIN information_schema.columns c
    ON c.table_schema = current_schema() AND c.table_name = 'catalogue_property_preferences' AND c.column_name = e.name
), unique_ok AS (
  SELECT bool_or(i.relname = 'catalogue_property_preferences_catalogueShareId_propertyId_key') AS ok
  FROM pg_class t
  JOIN pg_index ix ON ix.indrelid = t.oid
  JOIN pg_class i ON i.oid = ix.indexrelid
  WHERE t.relname = 'catalogue_property_preferences' AND ix.indisunique
), empty_ok AS (
  SELECT count(*) = 0 AS ok FROM "catalogue_property_preferences"
)
SELECT
  CASE WHEN enum_ok.ok AND columns_ok.ok AND unique_ok.ok AND empty_ok.ok THEN 'PASS' ELSE 'FAIL' END AS result,
  enum_ok.ok AS enum_ok,
  columns_ok.ok AS columns_ok,
  unique_ok.ok AS unique_ok,
  empty_ok.ok AS migration_created_no_rows
FROM enum_ok, columns_ok, unique_ok, empty_ok;
