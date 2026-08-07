-- Phase 5+6: additive negotiation and requirement-network records.
CREATE TYPE "DealOfferSide" AS ENUM ('CLIENT', 'OWNER', 'INVENTORY_PARTNER', 'INTERNAL');
CREATE TYPE "RequirementBroadcastStatus" AS ENUM ('DRAFT', 'SHARED', 'RESPONSE_RECEIVED', 'MATCH_FOUND', 'CLOSED');
CREATE TYPE "MatchRecommendationStatus" AS ENUM ('PENDING', 'IGNORED', 'ADDED_TO_CATALOGUE');

ALTER TABLE "deals" ADD COLUMN "expectedBrokerageAmount" INTEGER,
ADD COLUMN "kpSharePct" DOUBLE PRECISION,
ADD COLUMN "partnerSharePct" DOUBLE PRECISION,
ADD COLUMN "closingNotes" TEXT;

CREATE TABLE "deal_offers" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL DEFAULT 'org_default', "dealId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL, "side" "DealOfferSide" NOT NULL, "note" TEXT,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deal_offers_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "requirement_broadcasts" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL DEFAULT 'org_default', "leadId" TEXT NOT NULL,
  "requirementSnapshot" TEXT NOT NULL, "messageSnapshot" TEXT NOT NULL,
  "status" "RequirementBroadcastStatus" NOT NULL DEFAULT 'DRAFT', "createdById" TEXT NOT NULL,
  "sharedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "requirement_broadcasts_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "requirement_broadcast_recipients" (
  "id" TEXT NOT NULL, "requirementBroadcastId" TEXT NOT NULL, "inventoryPartnerId" TEXT NOT NULL,
  "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "respondedAt" TIMESTAMP(3), "responseNote" TEXT, "linkedPropertyId" TEXT,
  CONSTRAINT "requirement_broadcast_recipients_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "match_recommendations" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL DEFAULT 'org_default', "leadId" TEXT NOT NULL, "propertyId" TEXT NOT NULL,
  "score" INTEGER NOT NULL, "lifecycleKey" TEXT NOT NULL, "status" "MatchRecommendationStatus" NOT NULL DEFAULT 'PENDING',
  "ignoredAt" TIMESTAMP(3), "handledById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "match_recommendations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "deal_offers_organizationId_dealId_createdAt_idx" ON "deal_offers"("organizationId", "dealId", "createdAt");
CREATE INDEX "requirement_broadcasts_organizationId_leadId_status_idx" ON "requirement_broadcasts"("organizationId", "leadId", "status");
CREATE UNIQUE INDEX "requirement_broadcast_recipients_requirementBroadcastId_inventoryPartnerId_key" ON "requirement_broadcast_recipients"("requirementBroadcastId", "inventoryPartnerId");
CREATE UNIQUE INDEX "match_recommendations_organizationId_leadId_propertyId_lifecycleKey_key" ON "match_recommendations"("organizationId", "leadId", "propertyId", "lifecycleKey");
CREATE INDEX "match_recommendations_organizationId_leadId_status_idx" ON "match_recommendations"("organizationId", "leadId", "status");
ALTER TABLE "deal_offers" ADD CONSTRAINT "deal_offers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON UPDATE CASCADE, ADD CONSTRAINT "deal_offers_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE, ADD CONSTRAINT "deal_offers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON UPDATE CASCADE;
ALTER TABLE "requirement_broadcasts" ADD CONSTRAINT "requirement_broadcasts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON UPDATE CASCADE, ADD CONSTRAINT "requirement_broadcasts_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE, ADD CONSTRAINT "requirement_broadcasts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON UPDATE CASCADE;
ALTER TABLE "requirement_broadcast_recipients" ADD CONSTRAINT "requirement_broadcast_recipients_requirementBroadcastId_fkey" FOREIGN KEY ("requirementBroadcastId") REFERENCES "requirement_broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE, ADD CONSTRAINT "requirement_broadcast_recipients_inventoryPartnerId_fkey" FOREIGN KEY ("inventoryPartnerId") REFERENCES "inventory_partners"("id") ON UPDATE CASCADE;
ALTER TABLE "match_recommendations" ADD CONSTRAINT "match_recommendations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON UPDATE CASCADE, ADD CONSTRAINT "match_recommendations_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE, ADD CONSTRAINT "match_recommendations_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE, ADD CONSTRAINT "match_recommendations_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
