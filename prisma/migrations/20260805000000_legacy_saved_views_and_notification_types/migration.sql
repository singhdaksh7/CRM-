-- Repair migration: bring the tracked ledger in sync with schema objects
-- that were shipped to production by hand on 2026-08-05, before this repo
-- had a checked-in Prisma migration history:
--
--   prisma/manual-migrations/2026-08-05-phase2-saved-views-and-tags.sql
--   prisma/manual-migrations/2026-08-05-add-smart-notification-types.sql
--
-- Dated 2026-08-05 (not "now") and placed here in the migration ledger -
-- immediately after 20260803150000_maps_localities_visit_routing and before
-- 20260805160000_property_matching_workflow - to match when these objects
-- actually appeared in production and, critically, to run BEFORE
-- 20260819120000_demand_pool_matching, which already does
-- `ALTER TYPE "SavedViewEntityType" ADD VALUE 'CONTACT'/'REQUIREMENT'` and
-- therefore requires the type to already exist. A migration merely dated
-- 2026-08-30 would sort after that one and would not fix a fresh database -
-- the deploy would still fail on 20260819120000 before ever reaching it.
--
-- Every statement below is guarded so this is safe in both directions:
--
--  - Fresh/CI database: none of these objects exist yet -> everything is
--    created, exactly reproducing the manually-applied production schema.
--  - Existing production/staging: every object already exists (applied by
--    hand back on 2026-08-05) but has no corresponding row in
--    "_prisma_migrations" -> every guard finds its object already present
--    and no-ops, `prisma migrate deploy` still records this migration as
--    applied afterward. No table is dropped or recreated, no data is
--    touched, no enum value or column is removed.

-- CreateEnum (guarded: production already has this type)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SavedViewEntityType') THEN
    CREATE TYPE "SavedViewEntityType" AS ENUM ('LEAD', 'PROPERTY');
  END IF;
END
$$;

-- CreateTable (guarded: production already has this table)
CREATE TABLE IF NOT EXISTS "saved_views" (
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

-- CreateIndex (guarded: IF NOT EXISTS is valid on CREATE INDEX)
CREATE UNIQUE INDEX IF NOT EXISTS "saved_views_userId_entityType_name_key" ON "saved_views"("userId", "entityType", "name");
CREATE INDEX IF NOT EXISTS "saved_views_organizationId_userId_entityType_idx" ON "saved_views"("organizationId", "userId", "entityType");

-- AddForeignKey (guarded: production already has these constraints)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_views_organizationId_fkey') THEN
    ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_views_userId_fkey') THEN
    ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- AlterTable (guarded: production already has this column)
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "tags" TEXT NOT NULL DEFAULT '[]';

-- AlterEnum (idempotent by construction, same pattern already used by
-- 20260803130000_whatsapp_notification_types and other tracked migrations)
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'HOT_LEAD_NO_FOLLOWUP';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CATALOGUE_NO_RESPONSE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'VISIT_MISSED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PROPERTY_MISSING_PHOTOS';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DEAL_NEGOTIATION_STALE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DOCUMENT_EXPIRING';
