-- Idempotent production-runbook artifact. Review and execute this additive SQL only through the deployment process.
-- Source of truth: prisma/migrations/20260817200000_property_business_portals/migration.sql
-- Additive reconciliation for databases that received the earlier foundation.
DO $$ BEGIN
  CREATE TYPE "PortalCapabilityStatus" AS ENUM ('AVAILABLE', 'CONFIGURATION_REQUIRED', 'PARTNER_ACCESS_REQUIRED', 'NOT_SUPPORTED', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE "PortalIngestionStatus" ADD VALUE IF NOT EXISTS 'NEW';
ALTER TYPE "PortalIngestionStatus" ADD VALUE IF NOT EXISTS 'AMBIGUOUS';
ALTER TYPE "PortalIngestionStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TABLE "portal_listings" ALTER COLUMN "externalListingId" DROP NOT NULL;
ALTER TABLE "external_lead_events" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);
ALTER TABLE "external_lead_events" ADD COLUMN IF NOT EXISTS "resolvedById" TEXT;
-- PostgreSQL does not make every CREATE TYPE / ADD COLUMN construct universally idempotent; use the tracked migration for execution.
