-- Property Age Range feature: propertyAgeMinYears / propertyAgeMaxYears
--
-- Additive only: the legacy `propertyAgeYears` single-value column stays
-- exactly as-is (never dropped, never renamed) so no historical data is
-- lost. Two new nullable columns on "properties" carry the range going
-- forward - Property.propertyAgeMinYears / Property.propertyAgeMaxYears in
-- prisma/schema.prisma:
--   propertyAgeMinYears  Int?
--   propertyAgeMaxYears  Int?
--
-- This file is additive-only and idempotent (safe to run more than once):
-- the ADD COLUMN uses IF NOT EXISTS, and the backfill UPDATE only touches
-- rows where the new columns are still both NULL, so re-running it never
-- clobbers a value an operator (or a later edit) has since set.
--
-- Run directly against the Supabase database (SQL editor, or
-- `psql "$DIRECT_URL" -f prisma/manual-migrations/2026-09-21-property-age-range.sql`).
-- Use DIRECT_URL (port 5432, no pgbouncer), not DATABASE_URL - DDL should
-- not run through the transaction-mode pooler.

ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS "propertyAgeMinYears" INTEGER,
  ADD COLUMN IF NOT EXISTS "propertyAgeMaxYears" INTEGER;

-- Backfill: existing propertyAgeYears = X becomes min = X, max = X (an
-- "exact" age - see property-schema.test.ts / property-age.test.ts display
-- formatting, which renders min == max as "X years" not a range). NULL
-- propertyAgeYears rows are left as NULL/NULL ("age not specified").
-- Guarded by "both still NULL" so a second run never overwrites a value
-- that has since been set via the app.
UPDATE "properties"
SET "propertyAgeMinYears" = "propertyAgeYears",
    "propertyAgeMaxYears" = "propertyAgeYears"
WHERE "propertyAgeYears" IS NOT NULL
  AND "propertyAgeMinYears" IS NULL
  AND "propertyAgeMaxYears" IS NULL;

-- See 2026-09-21-property-age-range.verify.sql (companion file, in this same
-- directory) for the read-only verification query.
