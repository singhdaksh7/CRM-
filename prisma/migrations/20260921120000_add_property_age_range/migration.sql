-- Property Age Range feature.
--
-- Additive only: `propertyAgeYears` (the legacy single-value column) is kept
-- as-is, never dropped, so no historical data is lost. Two new nullable
-- columns carry the range going forward; manual create/edit always writes
-- both together (min == max for an exact age).
ALTER TABLE "properties" ADD COLUMN     "propertyAgeMaxYears" INTEGER,
ADD COLUMN     "propertyAgeMinYears" INTEGER;

-- Backfill: every existing row with a non-null propertyAgeYears value X gets
-- propertyAgeMinYears = X, propertyAgeMaxYears = X (an "exact" age, min ==
-- max). Rows where propertyAgeYears is NULL are left untouched (both new
-- columns stay NULL, matching "age not specified").
UPDATE "properties"
SET "propertyAgeMinYears" = "propertyAgeYears",
    "propertyAgeMaxYears" = "propertyAgeYears"
WHERE "propertyAgeYears" IS NOT NULL;
