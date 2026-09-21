-- Verification for 2026-09-21-property-age-range.sql
-- Read-only. Run after applying the migration above.
--
-- Expected result: exactly 2 rows, both nullable integers, no default.
--   propertyAgeMinYears | integer | YES | (null)
--   propertyAgeMaxYears | integer | YES | (null)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'properties'
  AND column_name IN ('propertyAgeMinYears', 'propertyAgeMaxYears')
ORDER BY column_name;

-- Expected result: 0 rows - every property that has a legacy
-- propertyAgeYears value must have been backfilled into the new min/max
-- columns (min = max = propertyAgeYears).
SELECT id, "propertyAgeYears", "propertyAgeMinYears", "propertyAgeMaxYears"
FROM "properties"
WHERE "propertyAgeYears" IS NOT NULL
  AND ("propertyAgeMinYears" IS DISTINCT FROM "propertyAgeYears"
    OR "propertyAgeMaxYears" IS DISTINCT FROM "propertyAgeYears");

-- Expected result: 0 rows - a property with no legacy age value must not
-- have had a range fabricated for it.
SELECT id, "propertyAgeYears", "propertyAgeMinYears", "propertyAgeMaxYears"
FROM "properties"
WHERE "propertyAgeYears" IS NULL
  AND ("propertyAgeMinYears" IS NOT NULL OR "propertyAgeMaxYears" IS NOT NULL);
