-- Additive Lead Requirements V2 schema. Legacy Lead and CustomerRequirement
-- fields/tables deliberately remain unchanged for backward compatibility.

CREATE TYPE "LeadRequirementStatus" AS ENUM ('ACTIVE', 'PAUSED', 'FULFILLED', 'CANCELLED');
CREATE TYPE "RequirementPreference" AS ENUM ('REQUIRED', 'PREFERRED', 'NO_PREFERENCE');

CREATE TABLE "lead_requirements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "assetClass" "AssetClass" NOT NULL DEFAULT 'RESIDENTIAL',
    "transactionType" "TransactionType" NOT NULL,
    "propertyType" "PropertyType",
    "minBudget" INTEGER,
    "maxBudget" INTEGER,
    "minAreaSqft" INTEGER,
    "maxAreaSqft" INTEGER,
    "floorPreference" TEXT,
    "liftPreference" "RequirementPreference" NOT NULL DEFAULT 'NO_PREFERENCE',
    "parkingPreference" "RequirementPreference" NOT NULL DEFAULT 'NO_PREFERENCE',
    "furnishingPreference" "FurnishingStatus",
    "possessionPreference" TEXT,
    "notes" TEXT,
    "status" "LeadRequirementStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "lead_requirements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lead_requirement_localities" (
    "requirementId" TEXT NOT NULL,
    "localityId" TEXT NOT NULL,
    CONSTRAINT "lead_requirement_localities_pkey" PRIMARY KEY ("requirementId", "localityId")
);

CREATE TABLE "lead_requirement_bhks" (
    "requirementId" TEXT NOT NULL,
    "bhk" INTEGER NOT NULL,
    CONSTRAINT "lead_requirement_bhks_pkey" PRIMARY KEY ("requirementId", "bhk")
);

CREATE INDEX "lead_requirements_organizationId_leadId_status_idx" ON "lead_requirements"("organizationId", "leadId", "status");
CREATE INDEX "lead_requirements_organizationId_status_transactionType_idx" ON "lead_requirements"("organizationId", "status", "transactionType");
CREATE INDEX "lead_requirement_localities_localityId_idx" ON "lead_requirement_localities"("localityId");

ALTER TABLE "lead_requirements" ADD CONSTRAINT "lead_requirements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_requirements" ADD CONSTRAINT "lead_requirements_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_requirements" ADD CONSTRAINT "lead_requirements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lead_requirement_localities" ADD CONSTRAINT "lead_requirement_localities_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "lead_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_requirement_localities" ADD CONSTRAINT "lead_requirement_localities_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "property_localities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lead_requirement_bhks" ADD CONSTRAINT "lead_requirement_bhks_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "lead_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
