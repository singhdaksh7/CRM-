-- Read-only verification for Property OPEN/STILT parking types migration.
WITH columns_expected(name, data_type, nullable) AS (
  VALUES
    ('hasOpenParking','boolean','NO'),
    ('hasStiltParking','boolean','NO'),
    ('parkingAvailable','boolean','NO')
), columns_ok AS (
  SELECT count(c.column_name) = 3 AND bool_and(coalesce(c.data_type = e.data_type AND c.is_nullable = e.nullable, false)) AS ok
  FROM columns_expected e
  LEFT JOIN information_schema.columns c
    ON c.table_schema = current_schema() AND c.table_name = 'properties' AND c.column_name = e.name
), backfill_ok AS (
  -- Every legacy "parkingAvailable = true" row must have retained at least
  -- one of the new flags set - the fact that parking existed must never be
  -- silently lost by this migration.
  SELECT count(*) = 0 AS ok
  FROM "properties"
  WHERE "parkingAvailable" = true AND "hasOpenParking" = false AND "hasStiltParking" = false
), no_orphan_flags AS (
  -- A row should never end up with a new flag set while the legacy
  -- "parkingAvailable" hasn't been synced true for it by the application
  -- layer going forward; this migration itself never sets a flag without
  -- the legacy column also already being true.
  SELECT count(*) = 0 AS ok
  FROM "properties"
  WHERE ("hasOpenParking" = true OR "hasStiltParking" = true) AND "parkingAvailable" = false
)
SELECT
  CASE WHEN columns_ok.ok AND backfill_ok.ok AND no_orphan_flags.ok THEN 'PASS' ELSE 'FAIL' END AS result,
  columns_ok.ok AS columns_ok,
  backfill_ok.ok AS backfill_preserved_all_legacy_parking_flags,
  no_orphan_flags.ok AS no_flags_set_without_legacy_column
FROM columns_ok, backfill_ok, no_orphan_flags;
