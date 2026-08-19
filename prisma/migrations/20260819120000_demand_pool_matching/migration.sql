-- Demand Pool + Customer Requirements + Two-Way Property Matching.
-- Additive only: new enums, two new tables (customer_contacts,
-- customer_requirements), one new join/history table
-- (property_recommendations), one nullable FK column on leads
-- (customerContactId), and two additive enum values on pre-existing enums
-- (ImportEntityType.CONTACTS, SavedViewEntityType.CONTACT/REQUIREMENT).
-- No existing Lead/Property row is read, updated, or deleted.

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DO_NOT_CONTACT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CustomerRequirementPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "RecommendationTier" AS ENUM ('EXACT', 'STRONG', 'STRETCH', 'LOW');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PENDING', 'REVIEWED', 'IGNORED', 'PREPARED', 'SENT', 'RESPONDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DemandCandidateSource" AS ENUM ('CONTACT', 'LEAD');

-- CreateEnum
CREATE TYPE "CustomerResponseOutcome" AS ENUM ('INTERESTED', 'NOT_INTERESTED', 'VISIT_REQUESTED', 'BUDGET_TOO_HIGH', 'LOCATION_NOT_SUITABLE', 'ALREADY_PURCHASED', 'DO_NOT_CONTACT');

-- AlterEnum
ALTER TYPE "ImportEntityType" ADD VALUE 'CONTACTS';

-- AlterEnum
ALTER TYPE "SavedViewEntityType" ADD VALUE 'CONTACT';

-- AlterEnum
ALTER TYPE "SavedViewEntityType" ADD VALUE 'REQUIREMENT';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN "customerContactId" TEXT;

-- CreateTable
CREATE TABLE "customer_contacts" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "customer_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_requirements" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "customer_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_recommendations" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "property_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leads_organizationId_customerContactId_idx" ON "leads"("organizationId", "customerContactId");

-- CreateIndex
CREATE INDEX "customer_contacts_organizationId_status_idx" ON "customer_contacts"("organizationId", "status");

-- CreateIndex
CREATE INDEX "customer_contacts_organizationId_email_idx" ON "customer_contacts"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "customer_contacts_organizationId_normalizedPhone_key" ON "customer_contacts"("organizationId", "normalizedPhone");

-- CreateIndex
CREATE UNIQUE INDEX "customer_requirements_convertedLeadId_key" ON "customer_requirements"("convertedLeadId");

-- CreateIndex
CREATE INDEX "customer_requirements_organizationId_active_assetClass_tran_idx" ON "customer_requirements"("organizationId", "active", "assetClass", "transactionType");

-- CreateIndex
CREATE INDEX "customer_requirements_customerContactId_idx" ON "customer_requirements"("customerContactId");

-- CreateIndex
CREATE INDEX "property_recommendations_organizationId_propertyId_tier_idx" ON "property_recommendations"("organizationId", "propertyId", "tier");

-- CreateIndex
CREATE INDEX "property_recommendations_organizationId_customerContactId_idx" ON "property_recommendations"("organizationId", "customerContactId");

-- CreateIndex
CREATE INDEX "property_recommendations_organizationId_leadId_idx" ON "property_recommendations"("organizationId", "leadId");

-- CreateIndex
CREATE INDEX "property_recommendations_organizationId_status_idx" ON "property_recommendations"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "property_recommendations_organizationId_propertyId_candidat_key" ON "property_recommendations"("organizationId", "propertyId", "candidateKey");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_customerContactId_fkey" FOREIGN KEY ("customerContactId") REFERENCES "customer_contacts"("id") ON DELETE SET NULL;

-- AddForeignKey
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL;

-- AddForeignKey
ALTER TABLE "customer_requirements" ADD CONSTRAINT "customer_requirements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_requirements" ADD CONSTRAINT "customer_requirements_customerContactId_fkey" FOREIGN KEY ("customerContactId") REFERENCES "customer_contacts"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_requirements" ADD CONSTRAINT "customer_requirements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL;

-- AddForeignKey
ALTER TABLE "customer_requirements" ADD CONSTRAINT "customer_requirements_convertedLeadId_fkey" FOREIGN KEY ("convertedLeadId") REFERENCES "leads"("id") ON DELETE SET NULL;

-- AddForeignKey
ALTER TABLE "property_recommendations" ADD CONSTRAINT "property_recommendations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "property_recommendations" ADD CONSTRAINT "property_recommendations_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "property_recommendations" ADD CONSTRAINT "property_recommendations_customerContactId_fkey" FOREIGN KEY ("customerContactId") REFERENCES "customer_contacts"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "property_recommendations" ADD CONSTRAINT "property_recommendations_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "property_recommendations" ADD CONSTRAINT "property_recommendations_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "customer_requirements"("id") ON DELETE SET NULL;

-- AddForeignKey
ALTER TABLE "property_recommendations" ADD CONSTRAINT "property_recommendations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL;

-- AddForeignKey
ALTER TABLE "property_recommendations" ADD CONSTRAINT "property_recommendations_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "users"("id") ON DELETE SET NULL;
