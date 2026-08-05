-- AlterEnum
-- Additive only - new ActivityType values used by the lead-to-property
-- matching workflow (matching pipeline milestones, shortlist edits, and
-- post-share property change alerts).
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'MATCHING_STARTED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'MATCHES_FOUND';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'SHORTLIST_UPDATED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'PROPERTY_UNAVAILABLE_AFTER_SHARE';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'PROPERTY_PRICE_CHANGED_AFTER_SHARE';

-- AlterEnum
-- Additive only - new NotificationType values for the same workflow.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MATCHES_READY';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'NO_MATCHES_FOUND';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CATALOGUE_READY_FOR_REVIEW';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CATALOGUE_SENT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PROPERTY_UNAVAILABLE_AFTER_SHARE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PROPERTY_PRICE_CHANGED_AFTER_SHARE';

-- AlterTable
-- Adds manual-shortlist-addition tracking, a single "top recommendation"
-- flag, and an internal-only note (never surfaced to the public catalogue
-- DTO) to catalogue_share_properties.
ALTER TABLE "catalogue_share_properties" ADD COLUMN     "internalNote" TEXT,
ADD COLUMN     "isTopPick" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "addedManually" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "addedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "catalogue_share_properties" ADD CONSTRAINT "catalogue_share_properties_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
