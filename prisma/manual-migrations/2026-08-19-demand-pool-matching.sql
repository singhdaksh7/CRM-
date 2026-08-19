-- Idempotent manual migration for the Demand Pool + Customer Requirements +
-- Two-Way Property Matching feature. Apply after all prior manual
-- migrations. Additive only: two new tables (customer_contacts,
-- customer_requirements), one new history/join table
-- (property_recommendations), one nullable FK column on leads
-- (customerContactId), and two additive enum values on pre-existing enums.
-- No existing Lead/Property/Catalogue/Visit row is read, updated, or
-- deleted by this file. Safe to re-run.

DO $$ BEGIN CREATE TYPE "ContactStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DO_NOT_CONTACT', 'ARCHIVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CustomerRequirementPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "RecommendationTier" AS ENUM ('EXACT', 'STRONG', 'STRETCH', 'LOW'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "RecommendationStatus" AS ENUM ('PENDING', 'REVIEWED', 'IGNORED', 'PREPARED', 'SENT', 'RESPONDED', 'EXPIRED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "DemandCandidateSource" AS ENUM ('CONTACT', 'LEAD'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CustomerResponseOutcome" AS ENUM ('INTERESTED', 'NOT_INTERESTED', 'VISIT_REQUESTED', 'BUDGET_TOO_HIGH', 'LOCATION_NOT_SUITABLE', 'ALREADY_PURCHASED', 'DO_NOT_CONTACT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE "ImportEntityType" ADD VALUE IF NOT EXISTS 'CONTACTS';
ALTER TYPE "SavedViewEntityType" ADD VALUE IF NOT EXISTS 'CONTACT';
ALTER TYPE "SavedViewEntityType" ADD VALUE IF NOT EXISTS 'REQUIREMENT';

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "customerContactId" TEXT;

CREATE TABLE IF NOT EXISTS "customer_contacts" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL DEFAULT 'org_default',
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "normalizedPhone" TEXT NOT NULL,
  "email" TEXT,
  "source" "LeadSource" NOT NULL DEFAULT 'MANUAL',
  "notes" TEXT,
  "tags" TEXT NOT NULL DEFAULT '[]',
  "status" "ContactStatus" NOT NULL DEFAULT 'ACTIVE',
  "doNotContact" BOOLEAN NOT NULL DEFAULT false,
  "whatsAppOptOut" BOOLEAN NOT NULL DEFAULT false,
  "lastContactedAt" TIMESTAMP(3),
  "lastPropertySentAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "customer_requirements" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL DEFAULT 'org_default',
  "customerContactId" TEXT NOT NULL,
  "assetClass" "AssetClass" NOT NULL DEFAULT 'RESIDENTIAL',
  "transactionType" "TransactionType" NOT NULL DEFAULT 'RENT',
  "propertyType" "PropertyType",
  "commercialPropertyType" "PropertyType",
  "preferredLocalities" TEXT NOT NULL DEFAULT '[]',
  "minBudget" INTEGER,
  "maxBudget" INTEGER,
  "minArea" INTEGER,
  "maxArea" INTEGER,
  "bhk" INTEGER,
  "floorPreference" TEXT,
  "furnishing" "FurnishingStatus",
  "parkingRequired" BOOLEAN,
  "liftRequired" BOOLEAN,
  "commercialFitOutPref" "CommercialFitOut",
  "workstations" INTEGER,
  "cabins" INTEGER,
  "possession" TEXT,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "priority" "CustomerRequirementPriority" NOT NULL DEFAULT 'MEDIUM',
  "lastConfirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "convertedLeadId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  FOREIGN KEY ("customerContactId") REFERENCES "customer_contacts"("id") ON DELETE CASCADE,
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL,
  FOREIGN KEY ("convertedLeadId") REFERENCES "leads"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "property_recommendations" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL DEFAULT 'org_default',
  "propertyId" TEXT NOT NULL,
  "source" "DemandCandidateSource" NOT NULL,
  "candidateKey" TEXT NOT NULL,
  "customerContactId" TEXT,
  "leadId" TEXT,
  "requirementId" TEXT,
  "tier" "RecommendationTier" NOT NULL,
  "score" INTEGER NOT NULL,
  "reasons" TEXT NOT NULL DEFAULT '[]',
  "status" "RecommendationStatus" NOT NULL DEFAULT 'PENDING',
  "preparedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "channel" TEXT,
  "providerMessageId" TEXT,
  "createdById" TEXT,
  "responseOutcome" "CustomerResponseOutcome",
  "respondedAt" TIMESTAMP(3),
  "respondedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE,
  FOREIGN KEY ("customerContactId") REFERENCES "customer_contacts"("id") ON DELETE CASCADE,
  FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE,
  FOREIGN KEY ("requirementId") REFERENCES "customer_requirements"("id") ON DELETE SET NULL,
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL,
  FOREIGN KEY ("respondedById") REFERENCES "users"("id") ON DELETE SET NULL
);

-- Reconciliation for a database where leads.customerContactId already existed
-- from an earlier partial run predating this FK.
DO $$ BEGIN
  ALTER TABLE "leads" ADD CONSTRAINT "leads_customerContactId_fkey" FOREIGN KEY ("customerContactId") REFERENCES "customer_contacts"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "leads_organizationId_customerContactId_idx" ON "leads"("organizationId", "customerContactId");
CREATE INDEX IF NOT EXISTS "customer_contacts_organizationId_status_idx" ON "customer_contacts"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "customer_contacts_organizationId_email_idx" ON "customer_contacts"("organizationId", "email");
CREATE UNIQUE INDEX IF NOT EXISTS "customer_contacts_organizationId_normalizedPhone_key" ON "customer_contacts"("organizationId", "normalizedPhone");
CREATE UNIQUE INDEX IF NOT EXISTS "customer_requirements_convertedLeadId_key" ON "customer_requirements"("convertedLeadId");
CREATE INDEX IF NOT EXISTS "customer_requirements_organizationId_active_assetClass_tran_idx" ON "customer_requirements"("organizationId", "active", "assetClass", "transactionType");
CREATE INDEX IF NOT EXISTS "customer_requirements_customerContactId_idx" ON "customer_requirements"("customerContactId");
CREATE INDEX IF NOT EXISTS "property_recommendations_organizationId_propertyId_tier_idx" ON "property_recommendations"("organizationId", "propertyId", "tier");
CREATE INDEX IF NOT EXISTS "property_recommendations_organizationId_customerContactId_idx" ON "property_recommendations"("organizationId", "customerContactId");
CREATE INDEX IF NOT EXISTS "property_recommendations_organizationId_leadId_idx" ON "property_recommendations"("organizationId", "leadId");
CREATE INDEX IF NOT EXISTS "property_recommendations_organizationId_status_idx" ON "property_recommendations"("organizationId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "property_recommendations_organizationId_propertyId_candidat_key" ON "property_recommendations"("organizationId", "propertyId", "candidateKey");

-- PostgreSQL does not make every CREATE TYPE / ADD COLUMN construct
-- universally idempotent by default; every statement above is deliberately
-- wrapped (DO/EXCEPTION, IF NOT EXISTS) so this whole file can be re-run
-- safely. Apply only through the deployment process, and only after
-- 2026-08-19-demand-pool-matching.pre-migration-baseline.sql has been run
-- and saved.
