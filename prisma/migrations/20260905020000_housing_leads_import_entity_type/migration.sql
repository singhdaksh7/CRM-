-- Forward-only, additive: introduces HOUSING_LEADS as a distinct
-- ImportJob/ImportRecord entityType for the Housing.com lead-export file
-- importer. No existing rows are altered or removed; every existing
-- ImportEntityType value keeps working exactly as before.
ALTER TYPE "ImportEntityType" ADD VALUE IF NOT EXISTS 'HOUSING_LEADS';
