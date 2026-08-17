-- Idempotent production-runbook artifact. Review and execute this additive SQL only through the deployment process.
-- Source of truth: prisma/migrations/20260817200000_property_business_portals/migration.sql
-- Standalone reconciliation: safe to run against a database that has NEVER received any part of
-- this feature (creates everything from scratch) and equally safe to re-run against a database
-- that already has some or all of it (every statement is a documented no-op in that case).

DO $$ BEGIN CREATE TYPE "AssetClass" AS ENUM ('RESIDENTIAL', 'COMMERCIAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TransactionType" AS ENUM ('RENT', 'SALE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CommercialFitOut" AS ENUM ('FURNISHED', 'SEMI_FURNISHED', 'BARE_SHELL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PropertyPortalProvider" AS ENUM ('HOUSING', 'NINETY_NINE_ACRES', 'MAGICBRICKS', 'OLX', 'SQUARE_CONNECT', 'OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PortalConnectionStatus" AS ENUM ('CONNECTED', 'NOT_CONFIGURED', 'DEGRADED', 'AUTH_FAILED', 'PARTNER_ACCESS_REQUIRED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PortalConnectionMode" AS ENUM ('API', 'WEBHOOK', 'CSV', 'EMAIL', 'MANUAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PortalListingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'INACTIVE', 'SYNC_CONFLICT', 'FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PortalIngestionStatus" AS ENUM ('NEW', 'RECEIVED', 'MATCHED_EXISTING', 'AMBIGUOUS', 'DUPLICATE', 'NEEDS_REVIEW', 'REJECTED', 'FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Declared in schema.prisma and generated into @prisma/client. Not yet referenced by a column
-- (capability state is currently evaluated in the contract-only registry rather than stored),
-- but Prisma still expects the type to exist, so it must be created here too.
DO $$ BEGIN CREATE TYPE "PortalCapabilityStatus" AS ENUM ('AVAILABLE', 'CONFIGURATION_REQUIRED', 'PARTNER_ACCESS_REQUIRED', 'NOT_SUPPORTED', 'UNKNOWN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Belt-and-suspenders for a database where an earlier partial run already created these types
-- with an incomplete value set (e.g. only the pre-merge values existed).
ALTER TYPE "PortalIngestionStatus" ADD VALUE IF NOT EXISTS 'NEW';
ALTER TYPE "PortalIngestionStatus" ADD VALUE IF NOT EXISTS 'RECEIVED';
ALTER TYPE "PortalIngestionStatus" ADD VALUE IF NOT EXISTS 'MATCHED_EXISTING';
ALTER TYPE "PortalIngestionStatus" ADD VALUE IF NOT EXISTS 'AMBIGUOUS';
ALTER TYPE "PortalIngestionStatus" ADD VALUE IF NOT EXISTS 'DUPLICATE';
ALTER TYPE "PortalIngestionStatus" ADD VALUE IF NOT EXISTS 'NEEDS_REVIEW';
ALTER TYPE "PortalIngestionStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "PortalIngestionStatus" ADD VALUE IF NOT EXISTS 'FAILED';

ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS 'STUDIO';
ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS 'FARM_HOUSE';
ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS 'CO_LIVING';
ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS 'OTHER';
ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS 'OFFICE';
ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS 'SHOP';
ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS 'SHOWROOM';
ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS 'WAREHOUSE';
ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS 'INDUSTRIAL';
ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS 'COMMERCIAL_LAND';
ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS 'CO_WORKING';
ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS 'RESTAURANT_SPACE';
ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS 'SCO';
ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS 'OTHER_COMMERCIAL';

ALTER TYPE "LeadSource" ADD VALUE IF NOT EXISTS 'OLX';
ALTER TYPE "LeadSource" ADD VALUE IF NOT EXISTS 'SQUARE_CONNECT';
ALTER TYPE "LeadSource" ADD VALUE IF NOT EXISTS 'DIRECT';
ALTER TYPE "LeadSource" ADD VALUE IF NOT EXISTS 'OTHER';

ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS "assetClass" "AssetClass" NOT NULL DEFAULT 'RESIDENTIAL',
  ADD COLUMN IF NOT EXISTS "superAreaSqft" INTEGER,
  ADD COLUMN IF NOT EXISTS "frontageFeet" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "ceilingHeightFeet" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "cabins" INTEGER,
  ADD COLUMN IF NOT EXISTS "workstations" INTEGER,
  ADD COLUMN IF NOT EXISTS "washrooms" INTEGER,
  ADD COLUMN IF NOT EXISTS "pantryAvailable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "powerLoadKw" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "commercialFitOut" "CommercialFitOut",
  ADD COLUMN IF NOT EXISTS "goodsLiftAvailable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "loadingAccessAvailable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "roadWidthFeet" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "cornerProperty" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "fireSafetyAvailable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "suitableForTags" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "leaseTermMonths" INTEGER,
  ADD COLUMN IF NOT EXISTS "lockInPeriodMonths" INTEGER,
  ADD COLUMN IF NOT EXISTS "noticePeriodMonths" INTEGER,
  ADD COLUMN IF NOT EXISTS "escalationPercentage" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "escalationIntervalMonths" INTEGER,
  ADD COLUMN IF NOT EXISTS "fitOutPeriodDays" INTEGER,
  ADD COLUMN IF NOT EXISTS "camCharge" INTEGER,
  ADD COLUMN IF NOT EXISTS "expectedPrice" INTEGER,
  ADD COLUMN IF NOT EXISTS "ownershipTitleNotes" TEXT;

ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "assetClass" "AssetClass" NOT NULL DEFAULT 'RESIDENTIAL',
  ADD COLUMN IF NOT EXISTS "transactionType" "TransactionType" NOT NULL DEFAULT 'RENT',
  ADD COLUMN IF NOT EXISTS "portalProvider" "PropertyPortalProvider",
  ADD COLUMN IF NOT EXISTS "externalListingId" TEXT,
  ADD COLUMN IF NOT EXISTS "rawPayloadHash" TEXT,
  ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "commercialPropertyType" "PropertyType",
  ADD COLUMN IF NOT EXISTS "minAreaSqft" INTEGER,
  ADD COLUMN IF NOT EXISTS "maxAreaSqft" INTEGER,
  ADD COLUMN IF NOT EXISTS "floorPreference" TEXT,
  ADD COLUMN IF NOT EXISTS "commercialFitOutPref" "CommercialFitOut",
  ADD COLUMN IF NOT EXISTS "parkingRequired" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "liftRequired" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "suitableForTags" TEXT NOT NULL DEFAULT '[]';

-- Deterministic backfill: safe to re-run, always converges to the same result and never touches
-- any other lead column (name/phone/status/assignment/etc are untouched).
UPDATE "leads"
SET "transactionType" = CASE WHEN "requirementType" = 'BUY' THEN 'SALE'::"TransactionType" ELSE 'RENT'::"TransactionType" END
WHERE "transactionType" IS DISTINCT FROM (CASE WHEN "requirementType" = 'BUY' THEN 'SALE'::"TransactionType" ELSE 'RENT'::"TransactionType" END);

CREATE TABLE IF NOT EXISTS "property_portal_connections" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL DEFAULT 'org_default',
  "provider" "PropertyPortalProvider" NOT NULL,
  "status" "PortalConnectionStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
  "connectionMode" "PortalConnectionMode" NOT NULL DEFAULT 'MANUAL',
  "displayName" TEXT,
  "accountReference" TEXT,
  "credentialReference" TEXT,
  "config" TEXT NOT NULL DEFAULT '{}',
  "lastSyncAt" TIMESTAMP(3),
  "lastSuccessfulSyncAt" TIMESTAMP(3),
  "lastErrorAt" TIMESTAMP(3),
  "lastErrorSummary" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "portal_listings" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL DEFAULT 'org_default',
  "connectionId" TEXT,
  "propertyId" TEXT NOT NULL,
  "provider" "PropertyPortalProvider" NOT NULL,
  "externalListingId" TEXT,
  "externalUrl" TEXT,
  "status" "PortalListingStatus" NOT NULL DEFAULT 'DRAFT',
  "publishedAt" TIMESTAMP(3),
  "lastSyncedAt" TIMESTAMP(3),
  "payloadHash" TEXT,
  "errorSummary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  FOREIGN KEY ("connectionId") REFERENCES "property_portal_connections"("id") ON DELETE SET NULL,
  FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE
);

-- Reconciliation for a database where portal_listings already existed from an earlier partial
-- run predating this externalListingId relaxation.
ALTER TABLE "portal_listings" ALTER COLUMN "externalListingId" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "external_lead_events" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL DEFAULT 'org_default',
  "connectionId" TEXT,
  "portalListingId" TEXT,
  "leadId" TEXT,
  "provider" "PropertyPortalProvider" NOT NULL,
  "externalLeadId" TEXT,
  "externalEventId" TEXT,
  "externalListingId" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "message" TEXT,
  "rawPayloadHash" TEXT NOT NULL,
  "ingestionStatus" "PortalIngestionStatus" NOT NULL DEFAULT 'NEW',
  "failureReason" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  FOREIGN KEY ("connectionId") REFERENCES "property_portal_connections"("id") ON DELETE SET NULL,
  FOREIGN KEY ("portalListingId") REFERENCES "portal_listings"("id") ON DELETE SET NULL,
  FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL
);

-- Reconciliation for a database where external_lead_events already existed from an earlier
-- partial run predating these two columns.
ALTER TABLE "external_lead_events" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);
ALTER TABLE "external_lead_events" ADD COLUMN IF NOT EXISTS "resolvedById" TEXT;

CREATE INDEX IF NOT EXISTS "properties_organizationId_assetClass_listingType_idx" ON "properties"("organizationId", "assetClass", "listingType");
CREATE INDEX IF NOT EXISTS "leads_organizationId_assetClass_transactionType_idx" ON "leads"("organizationId", "assetClass", "transactionType");
CREATE UNIQUE INDEX IF NOT EXISTS "portal_listings_organizationId_provider_externalListingId_key" ON "portal_listings"("organizationId", "provider", "externalListingId");
CREATE UNIQUE INDEX IF NOT EXISTS "external_lead_events_organizationId_provider_externalEventId_key" ON "external_lead_events"("organizationId", "provider", "externalEventId");

-- PostgreSQL does not make every CREATE TYPE / ADD COLUMN construct universally idempotent by
-- default; every statement above is deliberately wrapped (DO/EXCEPTION, IF NOT EXISTS, or a
-- no-op-converging UPDATE) so this whole file can be re-run safely. Apply only through the
-- deployment process, and only after 2026-08-18-property-business-and-portal-integrations
-- .pre-migration-baseline.sql has been run and reviewed.
