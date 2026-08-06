-- Catalogue schema-drift fix: catalogue_share_properties
--
-- Root cause: migration 20260805160000_property_matching_workflow exists in
-- prisma/migrations/ (and is checked into git) but was never applied to the
-- production database - it is absent from production's "_prisma_migrations"
-- table entirely (confirmed via a read-only query against it; every earlier
-- migration up to and including 20260803150000_maps_localities_visit_routing
-- is present and marked applied). Because of this gap, production's
-- catalogue_share_properties table is missing 4 columns that
-- prisma/schema.prisma's CatalogueShareProperty model declares:
-- internalNote, isTopPick, addedManually, addedByUserId. Every other
-- catalogue table/column (catalogue_shares, catalogue_interactions) was
-- checked against a live information_schema.columns query and matches the
-- Prisma schema exactly - no further drift found.
--
-- This file is additive-only and idempotent (safe to run more than once,
-- and safe to run whether or not the missing columns are already present):
-- every ADD COLUMN uses IF NOT EXISTS, and the foreign key is only added if
-- it does not already exist. No existing rows, columns, or types are
-- touched or dropped.
--
-- Column definitions match prisma/schema.prisma's CatalogueShareProperty
-- model exactly (see 20260805160000_property_matching_workflow/migration.sql
-- for the original, non-idempotent version of this same change):
--   internalNote   String?                    -> TEXT, nullable, no default
--   isTopPick      Boolean  @default(false)    -> BOOLEAN NOT NULL DEFAULT false
--   addedManually  Boolean  @default(false)    -> BOOLEAN NOT NULL DEFAULT false
--   addedByUserId  String?                     -> TEXT, nullable, FK -> users(id) ON DELETE SET NULL
--
-- Run directly against the Supabase database (SQL editor, or
-- `psql "$DIRECT_URL" -f prisma/manual-migrations/2026-08-06-catalogue-share-properties-drift-fix.sql`).
-- Use DIRECT_URL (port 5432, no pgbouncer), not DATABASE_URL - DDL should
-- not run through the transaction-mode pooler.

ALTER TABLE "catalogue_share_properties"
  ADD COLUMN IF NOT EXISTS "internalNote" TEXT,
  ADD COLUMN IF NOT EXISTS "isTopPick" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "addedManually" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "addedByUserId" TEXT;

-- Postgres has no "ADD CONSTRAINT IF NOT EXISTS" - guard it explicitly via
-- pg_constraint so this block is safe to re-run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'catalogue_share_properties_addedByUserId_fkey'
  ) THEN
    ALTER TABLE "catalogue_share_properties"
      ADD CONSTRAINT "catalogue_share_properties_addedByUserId_fkey"
      FOREIGN KEY ("addedByUserId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- See 2026-08-06-catalogue-share-properties-drift-fix.verify.sql (companion
-- file, in this same directory) for the read-only verification query.
