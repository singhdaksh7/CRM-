-- Phase 4 - Field Operations & Property Workflow
-- Generated offline via `prisma migrate diff --from-schema-datamodel <main's schema.prisma>
--   --to-schema-datamodel <this branch's schema.prisma> --script` (no live DB connection used -
-- this diff mode compares two static schema files only, never touches a database or shadow
-- database). This is the tool's own computed diff, not hand-authored SQL. Covers every schema
-- change between origin/main (9cac526, last production-applied commit) and this branch's HEAD:
-- 6 new enums, additive values on 4 existing enums, 9 new tables, and column/index/FK additions
-- on properties/notifications/activities/catalogue_shares/catalogue_share_properties.

-- CreateEnum
CREATE TYPE "InventorySource" AS ENUM ('DIRECT', 'INDIRECT');

-- CreateEnum
CREATE TYPE "CatalogueExecutiveStatus" AS ENUM ('PENDING', 'SHOWN', 'CUSTOMER_LIKED', 'SHORTLISTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AvailabilityReportStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AvailabilityReportReason" AS ENUM ('ALREADY_RENTED', 'ALREADY_SOLD', 'PROPERTY_LOCKED', 'OWNER_UNREACHABLE', 'OTHER');

-- CreateEnum
CREATE TYPE "PropertyReportType" AS ENUM ('WRONG_RENT', 'WRONG_PHOTOS', 'WRONG_AREA', 'OWNER_NOT_RESPONDING', 'DUPLICATE_LISTING', 'PROPERTY_CLOSED', 'ALREADY_RENTED', 'ALREADY_SOLD', 'NEEDS_NEW_PHOTOS', 'REQUIRES_VERIFICATION');

-- CreateEnum
CREATE TYPE "PropertyReportStatus" AS ENUM ('PENDING', 'RESOLVED', 'DISMISSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "VisitOutcome" ADD VALUE 'CUSTOMER_NO_SHOW';
ALTER TYPE "VisitOutcome" ADD VALUE 'OWNER_NO_SHOW';
ALTER TYPE "VisitOutcome" ADD VALUE 'NEGOTIATION_IN_PROGRESS';
ALTER TYPE "VisitOutcome" ADD VALUE 'SHORTLISTED';
ALTER TYPE "VisitOutcome" ADD VALUE 'REJECTED';
ALTER TYPE "VisitOutcome" ADD VALUE 'FOLLOW_UP_NEEDED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'EXECUTIVE_ASSIGNED';
ALTER TYPE "ActivityType" ADD VALUE 'VISIT_OUTCOME_RECORDED';
ALTER TYPE "ActivityType" ADD VALUE 'VISIT_FEEDBACK_SUBMITTED';
ALTER TYPE "ActivityType" ADD VALUE 'PROPERTY_AVAILABILITY_REPORTED';
ALTER TYPE "ActivityType" ADD VALUE 'PROPERTY_AVAILABILITY_APPROVED';
ALTER TYPE "ActivityType" ADD VALUE 'PROPERTY_AVAILABILITY_REJECTED';
ALTER TYPE "ActivityType" ADD VALUE 'PROPERTY_REPORTED';
ALTER TYPE "ActivityType" ADD VALUE 'PROPERTY_REPORT_RESOLVED';
ALTER TYPE "ActivityType" ADD VALUE 'PROPERTY_TIMELINE_EVENT';
ALTER TYPE "ActivityType" ADD VALUE 'PROPERTY_VERIFIED';
ALTER TYPE "ActivityType" ADD VALUE 'CATALOGUE_INTERNAL_SHARED';
ALTER TYPE "ActivityType" ADD VALUE 'CATALOGUE_PROPERTY_STATUS_UPDATED';
ALTER TYPE "ActivityType" ADD VALUE 'CATALOGUE_VERSION_CHANGED';
ALTER TYPE "ActivityType" ADD VALUE 'INVENTORY_PARTNER_CREATED';
ALTER TYPE "ActivityType" ADD VALUE 'INVENTORY_PARTNER_UPDATED';
ALTER TYPE "ActivityType" ADD VALUE 'CALL_INITIATED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'AVAILABILITY_REPORT_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'AVAILABILITY_REPORT_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'AVAILABILITY_REPORT_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'PROPERTY_REPORT_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'PROPERTY_REPORT_RESOLVED';
ALTER TYPE "NotificationType" ADD VALUE 'INTERNAL_CATALOGUE_SHARED';

-- AlterEnum
ALTER TYPE "PropertyImagePurpose" ADD VALUE 'AVAILABILITY_REPORT';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "inventoryPartnerId" TEXT;

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "buildingName" TEXT,
ADD COLUMN     "entryInstructions" TEXT,
ADD COLUMN     "flatNumber" TEXT,
ADD COLUMN     "gateNumber" TEXT,
ADD COLUMN     "hiddenRemarks" TEXT,
ADD COLUMN     "imagesUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "internalNotes" TEXT,
ADD COLUMN     "inventorySource" "InventorySource" NOT NULL DEFAULT 'DIRECT',
ADD COLUMN     "keyAvailability" TEXT,
ADD COLUMN     "lastVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "lastVerifiedById" TEXT,
ADD COLUMN     "negotiationNotes" TEXT,
ADD COLUMN     "partnerId" TEXT,
ADD COLUMN     "pendingVerification" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "propertySource" TEXT,
ALTER COLUMN "ownerName" DROP NOT NULL,
ALTER COLUMN "ownerPhone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "inventoryPartnerId" TEXT;

-- AlterTable
ALTER TABLE "catalogue_shares" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "catalogue_share_properties" ADD COLUMN     "executiveStatus" "CatalogueExecutiveStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "executiveStatusNote" TEXT,
ADD COLUMN     "executiveStatusUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "executiveStatusUpdatedById" TEXT,
ADD COLUMN     "removedAt" TIMESTAMP(3),
ADD COLUMN     "removedReason" TEXT;

-- CreateTable
CREATE TABLE "inventory_partners" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "partnerCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "phone" TEXT NOT NULL,
    "alternatePhone" TEXT,
    "localities" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "commissionSplitPct" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastInventoryUpdateAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_timeline_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "propertyId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_availability_reports" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "propertyId" TEXT NOT NULL,
    "visitId" TEXT,
    "reportedById" TEXT NOT NULL,
    "reason" "AvailabilityReportReason" NOT NULL,
    "note" TEXT,
    "photoId" TEXT NOT NULL,
    "status" "AvailabilityReportStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_availability_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_reports" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "propertyId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "type" "PropertyReportType" NOT NULL,
    "note" TEXT,
    "status" "PropertyReportStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_feedback" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "visitId" TEXT NOT NULL,
    "customerLiked" TEXT,
    "customerDisliked" TEXT,
    "budgetIssue" BOOLEAN NOT NULL DEFAULT false,
    "areaIssue" BOOLEAN NOT NULL DEFAULT false,
    "parkingIssue" BOOLEAN NOT NULL DEFAULT false,
    "familyRejected" BOOLEAN NOT NULL DEFAULT false,
    "ownerRejected" BOOLEAN NOT NULL DEFAULT false,
    "willVisitAgain" BOOLEAN NOT NULL DEFAULT false,
    "negotiationRequired" BOOLEAN NOT NULL DEFAULT false,
    "additionalNotes" TEXT,
    "submittedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visit_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_assignment_history" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "leadId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_assignment_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogue_version_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "catalogueShareId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "changeType" TEXT NOT NULL,
    "propertyId" TEXT,
    "reason" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalogue_version_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_favorites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_view_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_view_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_partners_partnerCode_key" ON "inventory_partners"("partnerCode");

-- CreateIndex
CREATE INDEX "inventory_partners_organizationId_isActive_idx" ON "inventory_partners"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "inventory_partners_organizationId_phone_idx" ON "inventory_partners"("organizationId", "phone");

-- CreateIndex
CREATE INDEX "property_timeline_events_organizationId_propertyId_createdA_idx" ON "property_timeline_events"("organizationId", "propertyId", "createdAt");

-- CreateIndex
CREATE INDEX "property_availability_reports_organizationId_status_idx" ON "property_availability_reports"("organizationId", "status");

-- CreateIndex
CREATE INDEX "property_availability_reports_propertyId_idx" ON "property_availability_reports"("propertyId");

-- CreateIndex
CREATE INDEX "property_reports_organizationId_status_idx" ON "property_reports"("organizationId", "status");

-- CreateIndex
CREATE INDEX "property_reports_propertyId_idx" ON "property_reports"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "visit_feedback_visitId_key" ON "visit_feedback"("visitId");

-- CreateIndex
CREATE INDEX "lead_assignment_history_organizationId_leadId_createdAt_idx" ON "lead_assignment_history"("organizationId", "leadId", "createdAt");

-- CreateIndex
CREATE INDEX "catalogue_version_events_catalogueShareId_version_idx" ON "catalogue_version_events"("catalogueShareId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "property_favorites_userId_propertyId_key" ON "property_favorites"("userId", "propertyId");

-- CreateIndex
CREATE INDEX "property_view_logs_userId_viewedAt_idx" ON "property_view_logs"("userId", "viewedAt");

-- CreateIndex
CREATE INDEX "properties_organizationId_inventorySource_idx" ON "properties"("organizationId", "inventorySource");

-- CreateIndex
CREATE INDEX "properties_partnerId_idx" ON "properties"("partnerId");

-- CreateIndex
CREATE INDEX "activities_inventoryPartnerId_idx" ON "activities"("inventoryPartnerId");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_inventoryPartnerId_fkey" FOREIGN KEY ("inventoryPartnerId") REFERENCES "inventory_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "inventory_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_lastVerifiedById_fkey" FOREIGN KEY ("lastVerifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_inventoryPartnerId_fkey" FOREIGN KEY ("inventoryPartnerId") REFERENCES "inventory_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_share_properties" ADD CONSTRAINT "catalogue_share_properties_executiveStatusUpdatedById_fkey" FOREIGN KEY ("executiveStatusUpdatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_partners" ADD CONSTRAINT "inventory_partners_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_partners" ADD CONSTRAINT "inventory_partners_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_timeline_events" ADD CONSTRAINT "property_timeline_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_timeline_events" ADD CONSTRAINT "property_timeline_events_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_timeline_events" ADD CONSTRAINT "property_timeline_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_availability_reports" ADD CONSTRAINT "property_availability_reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_availability_reports" ADD CONSTRAINT "property_availability_reports_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_availability_reports" ADD CONSTRAINT "property_availability_reports_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_availability_reports" ADD CONSTRAINT "property_availability_reports_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_availability_reports" ADD CONSTRAINT "property_availability_reports_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "property_images"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_availability_reports" ADD CONSTRAINT "property_availability_reports_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_reports" ADD CONSTRAINT "property_reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_reports" ADD CONSTRAINT "property_reports_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_reports" ADD CONSTRAINT "property_reports_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_reports" ADD CONSTRAINT "property_reports_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_feedback" ADD CONSTRAINT "visit_feedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_feedback" ADD CONSTRAINT "visit_feedback_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_feedback" ADD CONSTRAINT "visit_feedback_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignment_history" ADD CONSTRAINT "lead_assignment_history_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignment_history" ADD CONSTRAINT "lead_assignment_history_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignment_history" ADD CONSTRAINT "lead_assignment_history_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_version_events" ADD CONSTRAINT "catalogue_version_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_version_events" ADD CONSTRAINT "catalogue_version_events_catalogueShareId_fkey" FOREIGN KEY ("catalogueShareId") REFERENCES "catalogue_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_version_events" ADD CONSTRAINT "catalogue_version_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_favorites" ADD CONSTRAINT "property_favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_favorites" ADD CONSTRAINT "property_favorites_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_view_logs" ADD CONSTRAINT "property_view_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_view_logs" ADD CONSTRAINT "property_view_logs_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

