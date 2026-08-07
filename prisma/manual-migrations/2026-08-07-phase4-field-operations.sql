-- Phase 4 - Field Operations & Property Workflow
--
-- Generated from an OFFLINE schema diff: `prisma migrate diff
-- --from-schema-datamodel <origin/main's schema.prisma, commit 9cac526>
-- --to-schema-datamodel <this branch's schema.prisma> --script`. That mode
-- compares two static schema files only - no database or shadow database
-- was touched to produce it. The output is the tool's own computed DDL,
-- not hand-authored SQL; every statement below is that same DDL, each one
-- wrapped in an idempotency guard so this file is additive-only and safe
-- to re-run (mirrors 2026-08-06-phase3-business-intelligence.sql's
-- pattern exactly).
--
-- Read-only introspection against the connected database (via
-- `npm run seed:demo:dry-run`'s checkPhase4SchemaCompatibility, zero
-- writes) confirmed as of 2026-08-07: none of the 13 representative
-- Phase 4 columns/tables listed below exist yet - this migration has
-- never been applied.
--
-- Scope: 6 new enums (InventorySource, CatalogueExecutiveStatus,
-- AvailabilityReportStatus, AvailabilityReportReason, PropertyReportType,
-- PropertyReportStatus), additive values on 4 existing enums (VisitOutcome,
-- ActivityType, NotificationType, PropertyImagePurpose), 9 new tables
-- (inventory_partners, property_timeline_events,
-- property_availability_reports, property_reports, visit_feedback,
-- lead_assignment_history, catalogue_version_events, property_favorites,
-- property_view_logs), and column/index/FK additions on properties,
-- notifications, activities, catalogue_shares, catalogue_share_properties.
--
-- No DROP, no TRUNCATE, no destructive ALTER anywhere in this file. The
-- only non-additive change is `properties.ownerName`/`ownerPhone` losing
-- their NOT NULL constraint (an INDIRECT property legitimately has no
-- owner, only an InventoryPartner) - DROP NOT NULL never touches existing
-- data, and is itself idempotent (a no-op if already nullable). All new
-- columns are nullable or carry a default, so every existing row backfills
-- cleanly with no manual data migration required. Organization scoping
-- (organizationId TEXT NOT NULL DEFAULT 'org_default', FK ->
-- organizations(id)) matches every other org-scoped table in this schema.
--
-- Must run outside of an explicit multi-statement transaction: Postgres
-- does not allow `ALTER TYPE ... ADD VALUE` to be used in the same
-- transaction that adds it. Running this file via `psql -f` (each
-- statement auto-committed) is safe, matching how
-- 2026-08-05-add-smart-notification-types.sql documents the same
-- constraint. Run against DIRECT_URL (port 5432, no pgbouncer) - DDL
-- should not run through the transaction-mode pooler:
--   psql "$DIRECT_URL" -f prisma/manual-migrations/2026-08-07-phase4-field-operations.sql
--
-- Companion file: 2026-08-07-phase4-field-operations.verify.sql
-- (read-only, run after applying this file).
--
-- NOT YET SIGNED OFF - do not run against production until explicitly
-- approved. This file is prepared and ready, matching the same
-- prepare-now/apply-later pattern used for Phase 3.

-- ---------------------------------------------------------------------
-- New enums
-- ---------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InventorySource') THEN
    CREATE TYPE "InventorySource" AS ENUM ('DIRECT', 'INDIRECT');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CatalogueExecutiveStatus') THEN
    CREATE TYPE "CatalogueExecutiveStatus" AS ENUM ('PENDING', 'SHOWN', 'CUSTOMER_LIKED', 'SHORTLISTED', 'REJECTED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AvailabilityReportStatus') THEN
    CREATE TYPE "AvailabilityReportStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AvailabilityReportReason') THEN
    CREATE TYPE "AvailabilityReportReason" AS ENUM ('ALREADY_RENTED', 'ALREADY_SOLD', 'PROPERTY_LOCKED', 'OWNER_UNREACHABLE', 'OTHER');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PropertyReportType') THEN
    CREATE TYPE "PropertyReportType" AS ENUM (
      'WRONG_RENT', 'WRONG_PHOTOS', 'WRONG_AREA', 'OWNER_NOT_RESPONDING', 'DUPLICATE_LISTING',
      'PROPERTY_CLOSED', 'ALREADY_RENTED', 'ALREADY_SOLD', 'NEEDS_NEW_PHOTOS', 'REQUIRES_VERIFICATION'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PropertyReportStatus') THEN
    CREATE TYPE "PropertyReportStatus" AS ENUM ('PENDING', 'RESOLVED', 'DISMISSED');
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Additive values on existing enums
-- ---------------------------------------------------------------------

ALTER TYPE "VisitOutcome" ADD VALUE IF NOT EXISTS 'CUSTOMER_NO_SHOW';
ALTER TYPE "VisitOutcome" ADD VALUE IF NOT EXISTS 'OWNER_NO_SHOW';
ALTER TYPE "VisitOutcome" ADD VALUE IF NOT EXISTS 'NEGOTIATION_IN_PROGRESS';
ALTER TYPE "VisitOutcome" ADD VALUE IF NOT EXISTS 'SHORTLISTED';
ALTER TYPE "VisitOutcome" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "VisitOutcome" ADD VALUE IF NOT EXISTS 'FOLLOW_UP_NEEDED';

ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'EXECUTIVE_ASSIGNED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'VISIT_OUTCOME_RECORDED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'VISIT_FEEDBACK_SUBMITTED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'PROPERTY_AVAILABILITY_REPORTED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'PROPERTY_AVAILABILITY_APPROVED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'PROPERTY_AVAILABILITY_REJECTED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'PROPERTY_REPORTED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'PROPERTY_REPORT_RESOLVED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'PROPERTY_TIMELINE_EVENT';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'PROPERTY_VERIFIED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CATALOGUE_INTERNAL_SHARED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CATALOGUE_PROPERTY_STATUS_UPDATED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CATALOGUE_VERSION_CHANGED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'INVENTORY_PARTNER_CREATED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'INVENTORY_PARTNER_UPDATED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CALL_INITIATED';

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'AVAILABILITY_REPORT_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'AVAILABILITY_REPORT_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'AVAILABILITY_REPORT_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PROPERTY_REPORT_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PROPERTY_REPORT_RESOLVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'INTERNAL_CATALOGUE_SHARED';

ALTER TYPE "PropertyImagePurpose" ADD VALUE IF NOT EXISTS 'AVAILABILITY_REPORT';

-- ---------------------------------------------------------------------
-- Existing table alterations
-- ---------------------------------------------------------------------

ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "inventoryPartnerId" TEXT;

ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS "buildingName" TEXT,
  ADD COLUMN IF NOT EXISTS "entryInstructions" TEXT,
  ADD COLUMN IF NOT EXISTS "flatNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "gateNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "hiddenRemarks" TEXT,
  ADD COLUMN IF NOT EXISTS "imagesUpdatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "internalNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "inventorySource" "InventorySource" NOT NULL DEFAULT 'DIRECT',
  ADD COLUMN IF NOT EXISTS "keyAvailability" TEXT,
  ADD COLUMN IF NOT EXISTS "lastVerifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastVerifiedById" TEXT,
  ADD COLUMN IF NOT EXISTS "negotiationNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "partnerId" TEXT,
  ADD COLUMN IF NOT EXISTS "pendingVerification" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "propertySource" TEXT;

-- Idempotent by nature: a no-op if the column is already nullable. Never
-- touches existing row data - an INDIRECT property (no Owner, only an
-- InventoryPartner) is the only reason this changed; DIRECT properties
-- keep populating both fields exactly as before.
ALTER TABLE "properties" ALTER COLUMN "ownerName" DROP NOT NULL;
ALTER TABLE "properties" ALTER COLUMN "ownerPhone" DROP NOT NULL;

ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "inventoryPartnerId" TEXT;

ALTER TABLE "catalogue_shares" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "catalogue_share_properties"
  ADD COLUMN IF NOT EXISTS "executiveStatus" "CatalogueExecutiveStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "executiveStatusNote" TEXT,
  ADD COLUMN IF NOT EXISTS "executiveStatusUpdatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "executiveStatusUpdatedById" TEXT,
  ADD COLUMN IF NOT EXISTS "removedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "removedReason" TEXT;

-- ---------------------------------------------------------------------
-- inventory_partners
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "inventory_partners" (
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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'inventory_partners_partnerCode_key') THEN
    CREATE UNIQUE INDEX "inventory_partners_partnerCode_key" ON "inventory_partners"("partnerCode");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'inventory_partners_organizationId_isActive_idx') THEN
    CREATE INDEX "inventory_partners_organizationId_isActive_idx" ON "inventory_partners"("organizationId", "isActive");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'inventory_partners_organizationId_phone_idx') THEN
    CREATE INDEX "inventory_partners_organizationId_phone_idx" ON "inventory_partners"("organizationId", "phone");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_partners_organizationId_fkey') THEN
    ALTER TABLE "inventory_partners" ADD CONSTRAINT "inventory_partners_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_partners_createdById_fkey') THEN
    ALTER TABLE "inventory_partners" ADD CONSTRAINT "inventory_partners_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- property_timeline_events (append-only)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "property_timeline_events" (
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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'property_timeline_events_organizationId_propertyId_createdA_idx') THEN
    CREATE INDEX "property_timeline_events_organizationId_propertyId_createdA_idx" ON "property_timeline_events"("organizationId", "propertyId", "createdAt");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_timeline_events_organizationId_fkey') THEN
    ALTER TABLE "property_timeline_events" ADD CONSTRAINT "property_timeline_events_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_timeline_events_propertyId_fkey') THEN
    ALTER TABLE "property_timeline_events" ADD CONSTRAINT "property_timeline_events_propertyId_fkey"
      FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_timeline_events_actorId_fkey') THEN
    ALTER TABLE "property_timeline_events" ADD CONSTRAINT "property_timeline_events_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- property_availability_reports (photoId required - photo evidence)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "property_availability_reports" (
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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'property_availability_reports_organizationId_status_idx') THEN
    CREATE INDEX "property_availability_reports_organizationId_status_idx" ON "property_availability_reports"("organizationId", "status");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'property_availability_reports_propertyId_idx') THEN
    CREATE INDEX "property_availability_reports_propertyId_idx" ON "property_availability_reports"("propertyId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_availability_reports_organizationId_fkey') THEN
    ALTER TABLE "property_availability_reports" ADD CONSTRAINT "property_availability_reports_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_availability_reports_propertyId_fkey') THEN
    ALTER TABLE "property_availability_reports" ADD CONSTRAINT "property_availability_reports_propertyId_fkey"
      FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_availability_reports_visitId_fkey') THEN
    ALTER TABLE "property_availability_reports" ADD CONSTRAINT "property_availability_reports_visitId_fkey"
      FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_availability_reports_reportedById_fkey') THEN
    ALTER TABLE "property_availability_reports" ADD CONSTRAINT "property_availability_reports_reportedById_fkey"
      FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_availability_reports_photoId_fkey') THEN
    ALTER TABLE "property_availability_reports" ADD CONSTRAINT "property_availability_reports_photoId_fkey"
      FOREIGN KEY ("photoId") REFERENCES "property_images"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_availability_reports_reviewedById_fkey') THEN
    ALTER TABLE "property_availability_reports" ADD CONSTRAINT "property_availability_reports_reviewedById_fkey"
      FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- property_reports (general data-quality queue)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "property_reports" (
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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'property_reports_organizationId_status_idx') THEN
    CREATE INDEX "property_reports_organizationId_status_idx" ON "property_reports"("organizationId", "status");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'property_reports_propertyId_idx') THEN
    CREATE INDEX "property_reports_propertyId_idx" ON "property_reports"("propertyId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_reports_organizationId_fkey') THEN
    ALTER TABLE "property_reports" ADD CONSTRAINT "property_reports_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_reports_propertyId_fkey') THEN
    ALTER TABLE "property_reports" ADD CONSTRAINT "property_reports_propertyId_fkey"
      FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_reports_reportedById_fkey') THEN
    ALTER TABLE "property_reports" ADD CONSTRAINT "property_reports_reportedById_fkey"
      FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_reports_resolvedById_fkey') THEN
    ALTER TABLE "property_reports" ADD CONSTRAINT "property_reports_resolvedById_fkey"
      FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- visit_feedback (one-to-one with visits)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "visit_feedback" (
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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'visit_feedback_visitId_key') THEN
    CREATE UNIQUE INDEX "visit_feedback_visitId_key" ON "visit_feedback"("visitId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visit_feedback_organizationId_fkey') THEN
    ALTER TABLE "visit_feedback" ADD CONSTRAINT "visit_feedback_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visit_feedback_visitId_fkey') THEN
    ALTER TABLE "visit_feedback" ADD CONSTRAINT "visit_feedback_visitId_fkey"
      FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visit_feedback_submittedById_fkey') THEN
    ALTER TABLE "visit_feedback" ADD CONSTRAINT "visit_feedback_submittedById_fkey"
      FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- lead_assignment_history (append-only)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "lead_assignment_history" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "leadId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_assignment_history_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'lead_assignment_history_organizationId_leadId_createdAt_idx') THEN
    CREATE INDEX "lead_assignment_history_organizationId_leadId_createdAt_idx" ON "lead_assignment_history"("organizationId", "leadId", "createdAt");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_assignment_history_organizationId_fkey') THEN
    ALTER TABLE "lead_assignment_history" ADD CONSTRAINT "lead_assignment_history_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_assignment_history_leadId_fkey') THEN
    ALTER TABLE "lead_assignment_history" ADD CONSTRAINT "lead_assignment_history_leadId_fkey"
      FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_assignment_history_toUserId_fkey') THEN
    ALTER TABLE "lead_assignment_history" ADD CONSTRAINT "lead_assignment_history_toUserId_fkey"
      FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- catalogue_version_events (append-only)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "catalogue_version_events" (
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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'catalogue_version_events_catalogueShareId_version_idx') THEN
    CREATE INDEX "catalogue_version_events_catalogueShareId_version_idx" ON "catalogue_version_events"("catalogueShareId", "version");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalogue_version_events_organizationId_fkey') THEN
    ALTER TABLE "catalogue_version_events" ADD CONSTRAINT "catalogue_version_events_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalogue_version_events_catalogueShareId_fkey') THEN
    ALTER TABLE "catalogue_version_events" ADD CONSTRAINT "catalogue_version_events_catalogueShareId_fkey"
      FOREIGN KEY ("catalogueShareId") REFERENCES "catalogue_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalogue_version_events_actorId_fkey') THEN
    ALTER TABLE "catalogue_version_events" ADD CONSTRAINT "catalogue_version_events_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- property_favorites
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "property_favorites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_favorites_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'property_favorites_userId_propertyId_key') THEN
    CREATE UNIQUE INDEX "property_favorites_userId_propertyId_key" ON "property_favorites"("userId", "propertyId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_favorites_userId_fkey') THEN
    ALTER TABLE "property_favorites" ADD CONSTRAINT "property_favorites_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_favorites_propertyId_fkey') THEN
    ALTER TABLE "property_favorites" ADD CONSTRAINT "property_favorites_propertyId_fkey"
      FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- property_view_logs
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "property_view_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_view_logs_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'property_view_logs_userId_viewedAt_idx') THEN
    CREATE INDEX "property_view_logs_userId_viewedAt_idx" ON "property_view_logs"("userId", "viewedAt");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_view_logs_userId_fkey') THEN
    ALTER TABLE "property_view_logs" ADD CONSTRAINT "property_view_logs_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_view_logs_propertyId_fkey') THEN
    ALTER TABLE "property_view_logs" ADD CONSTRAINT "property_view_logs_propertyId_fkey"
      FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- New indexes / FKs on existing tables (properties, activities)
-- ---------------------------------------------------------------------

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'properties_organizationId_inventorySource_idx') THEN
    CREATE INDEX "properties_organizationId_inventorySource_idx" ON "properties"("organizationId", "inventorySource");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'properties_partnerId_idx') THEN
    CREATE INDEX "properties_partnerId_idx" ON "properties"("partnerId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'activities_inventoryPartnerId_idx') THEN
    CREATE INDEX "activities_inventoryPartnerId_idx" ON "activities"("inventoryPartnerId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_inventoryPartnerId_fkey') THEN
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_inventoryPartnerId_fkey"
      FOREIGN KEY ("inventoryPartnerId") REFERENCES "inventory_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_partnerId_fkey') THEN
    ALTER TABLE "properties" ADD CONSTRAINT "properties_partnerId_fkey"
      FOREIGN KEY ("partnerId") REFERENCES "inventory_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_lastVerifiedById_fkey') THEN
    ALTER TABLE "properties" ADD CONSTRAINT "properties_lastVerifiedById_fkey"
      FOREIGN KEY ("lastVerifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activities_inventoryPartnerId_fkey') THEN
    ALTER TABLE "activities" ADD CONSTRAINT "activities_inventoryPartnerId_fkey"
      FOREIGN KEY ("inventoryPartnerId") REFERENCES "inventory_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalogue_share_properties_executiveStatusUpdatedById_fkey') THEN
    ALTER TABLE "catalogue_share_properties" ADD CONSTRAINT "catalogue_share_properties_executiveStatusUpdatedById_fkey"
      FOREIGN KEY ("executiveStatusUpdatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
