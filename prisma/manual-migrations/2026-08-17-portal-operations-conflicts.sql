-- Idempotent manual migration; apply after 2026-08-17-property-business-portals.sql.
DO $$ BEGIN CREATE TYPE "PortalOperationStatus" AS ENUM ('PENDING', 'RETRYABLE', 'SUCCEEDED', 'DEAD_LETTER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PortalConflictResolution" AS ENUM ('KEEP_CRM', 'ACCEPT_PORTAL', 'REVIEW'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "portal_listings" ADD COLUMN IF NOT EXISTS "payloadVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "portal_listings" ADD COLUMN IF NOT EXISTS "conflictFields" TEXT;
ALTER TABLE "portal_listings" ADD COLUMN IF NOT EXISTS "portalSnapshot" TEXT;
ALTER TABLE "portal_listings" ADD COLUMN IF NOT EXISTS "conflictDetectedAt" TIMESTAMP(3);
ALTER TABLE "portal_listings" ADD COLUMN IF NOT EXISTS "conflictResolvedAt" TIMESTAMP(3);
ALTER TABLE "portal_listings" ADD COLUMN IF NOT EXISTS "conflictResolution" "PortalConflictResolution";
ALTER TABLE "portal_listings" ADD COLUMN IF NOT EXISTS "conflictResolvedById" TEXT;
CREATE TABLE IF NOT EXISTS "portal_operations" ("id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL DEFAULT 'org_default', "portalListingId" TEXT, "connectionId" TEXT, "provider" "PropertyPortalProvider" NOT NULL, "operationType" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "status" "PortalOperationStatus" NOT NULL DEFAULT 'PENDING', "failureReason" TEXT, "attemptCount" INTEGER NOT NULL DEFAULT 0, "lastAttemptAt" TIMESTAMP(3), "retryEligibleAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);

-- Reconciliation for a database where portal_operations already existed from an earlier
-- partial run predating these foreign keys.
DO $$ BEGIN
  ALTER TABLE "portal_operations" ADD CONSTRAINT "portal_operations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "portal_operations" ADD CONSTRAINT "portal_operations_portalListingId_fkey" FOREIGN KEY ("portalListingId") REFERENCES "portal_listings"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "portal_operations" ADD CONSTRAINT "portal_operations_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "property_portal_connections"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "portal_operations_organizationId_idempotencyKey_key" ON "portal_operations"("organizationId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "portal_operations_organizationId_provider_status_retryEligibleAt_idx" ON "portal_operations"("organizationId", "provider", "status", "retryEligibleAt");
