-- Smart CRM V2 Phase 2 - Saved Views + Property tags
--
-- Additive only: one new enum, one new table, one new nullable-by-default
-- column. No existing rows, columns, or types are touched. Safe to run at
-- any time, with no downtime. Run this BEFORE deploying the Phase 2 code
-- that references SavedView/Property.tags - the Saved Views API and the
-- bulk "Add Tags" property action will fail until this has run.
--
-- Run directly against the Supabase database (SQL editor, or
-- `psql "$DIRECT_URL" -f prisma/manual-migrations/2026-08-05-phase2-saved-views-and-tags.sql`).

CREATE TYPE "SavedViewEntityType" AS ENUM ('LEAD', 'PROPERTY');

CREATE TABLE "saved_views" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "userId" TEXT NOT NULL,
    "entityType" "SavedViewEntityType" NOT NULL,
    "name" TEXT NOT NULL,
    "filters" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "saved_views_userId_entityType_name_key" ON "saved_views"("userId", "entityType", "name");
CREATE INDEX "saved_views_organizationId_userId_entityType_idx" ON "saved_views"("organizationId", "userId", "entityType");

ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "properties" ADD COLUMN "tags" TEXT NOT NULL DEFAULT '[]';
