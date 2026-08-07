-- Additive, idempotent Phase 5+6 compatibility migration. Never run automatically.
-- Use DIRECT_URL only after review; this script intentionally has no data writes.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='DealOfferSide') THEN CREATE TYPE "DealOfferSide" AS ENUM ('CLIENT','OWNER','INVENTORY_PARTNER','INTERNAL'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='RequirementBroadcastStatus') THEN CREATE TYPE "RequirementBroadcastStatus" AS ENUM ('DRAFT','SHARED','RESPONSE_RECEIVED','MATCH_FOUND','CLOSED'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='MatchRecommendationStatus') THEN CREATE TYPE "MatchRecommendationStatus" AS ENUM ('PENDING','IGNORED','ADDED_TO_CATALOGUE'); END IF;
END $$;
ALTER TYPE "DealOfferSide" ADD VALUE IF NOT EXISTS 'CLIENT';
ALTER TYPE "DealOfferSide" ADD VALUE IF NOT EXISTS 'OWNER';
ALTER TYPE "DealOfferSide" ADD VALUE IF NOT EXISTS 'INVENTORY_PARTNER';
ALTER TYPE "DealOfferSide" ADD VALUE IF NOT EXISTS 'INTERNAL';
ALTER TYPE "RequirementBroadcastStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "RequirementBroadcastStatus" ADD VALUE IF NOT EXISTS 'SHARED';
ALTER TYPE "RequirementBroadcastStatus" ADD VALUE IF NOT EXISTS 'RESPONSE_RECEIVED';
ALTER TYPE "RequirementBroadcastStatus" ADD VALUE IF NOT EXISTS 'MATCH_FOUND';
ALTER TYPE "RequirementBroadcastStatus" ADD VALUE IF NOT EXISTS 'CLOSED';
ALTER TYPE "MatchRecommendationStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "MatchRecommendationStatus" ADD VALUE IF NOT EXISTS 'IGNORED';
ALTER TYPE "MatchRecommendationStatus" ADD VALUE IF NOT EXISTS 'ADDED_TO_CATALOGUE';
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "expectedBrokerageAmount" INTEGER;
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "kpSharePct" DOUBLE PRECISION;
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "partnerSharePct" DOUBLE PRECISION;
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "closingNotes" TEXT;
CREATE TABLE IF NOT EXISTS "deal_offers" ("id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL DEFAULT 'org_default',"dealId" TEXT NOT NULL,"amount" INTEGER NOT NULL,"side" "DealOfferSide" NOT NULL,"note" TEXT,"createdById" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS "requirement_broadcasts" ("id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL DEFAULT 'org_default',"leadId" TEXT NOT NULL,"requirementSnapshot" TEXT NOT NULL,"messageSnapshot" TEXT NOT NULL,"status" "RequirementBroadcastStatus" NOT NULL DEFAULT 'DRAFT',"createdById" TEXT NOT NULL,"sharedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE IF NOT EXISTS "requirement_broadcast_recipients" ("id" TEXT PRIMARY KEY,"requirementBroadcastId" TEXT NOT NULL,"inventoryPartnerId" TEXT NOT NULL,"selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"respondedAt" TIMESTAMP(3),"responseNote" TEXT,"linkedPropertyId" TEXT);
CREATE TABLE IF NOT EXISTS "match_recommendations" ("id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL DEFAULT 'org_default',"leadId" TEXT NOT NULL,"propertyId" TEXT NOT NULL,"score" INTEGER NOT NULL,"lifecycleKey" TEXT NOT NULL,"status" "MatchRecommendationStatus" NOT NULL DEFAULT 'PENDING',"ignoredAt" TIMESTAMP(3),"handledById" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX IF NOT EXISTS "deal_offers_organizationId_dealId_createdAt_idx" ON "deal_offers"("organizationId","dealId","createdAt");
CREATE INDEX IF NOT EXISTS "requirement_broadcasts_organizationId_leadId_status_idx" ON "requirement_broadcasts"("organizationId","leadId","status");
CREATE UNIQUE INDEX IF NOT EXISTS "requirement_broadcast_recipients_requirementBroadcastId_inventoryPartnerId_key" ON "requirement_broadcast_recipients"("requirementBroadcastId","inventoryPartnerId");
CREATE UNIQUE INDEX IF NOT EXISTS "match_recommendations_organizationId_leadId_propertyId_lifecycleKey_key" ON "match_recommendations"("organizationId","leadId","propertyId","lifecycleKey");
CREATE INDEX IF NOT EXISTS "match_recommendations_organizationId_leadId_status_idx" ON "match_recommendations"("organizationId","leadId","status");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='deal_offers_organizationId_fkey') THEN ALTER TABLE "deal_offers" ADD CONSTRAINT "deal_offers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='deal_offers_dealId_fkey') THEN ALTER TABLE "deal_offers" ADD CONSTRAINT "deal_offers_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='deal_offers_createdById_fkey') THEN ALTER TABLE "deal_offers" ADD CONSTRAINT "deal_offers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='requirement_broadcasts_organizationId_fkey') THEN ALTER TABLE "requirement_broadcasts" ADD CONSTRAINT "requirement_broadcasts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='requirement_broadcasts_leadId_fkey') THEN ALTER TABLE "requirement_broadcasts" ADD CONSTRAINT "requirement_broadcasts_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='requirement_broadcasts_createdById_fkey') THEN ALTER TABLE "requirement_broadcasts" ADD CONSTRAINT "requirement_broadcasts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='requirement_broadcast_recipients_requirementBroadcastId_fkey') THEN ALTER TABLE "requirement_broadcast_recipients" ADD CONSTRAINT "requirement_broadcast_recipients_requirementBroadcastId_fkey" FOREIGN KEY ("requirementBroadcastId") REFERENCES "requirement_broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='requirement_broadcast_recipients_inventoryPartnerId_fkey') THEN ALTER TABLE "requirement_broadcast_recipients" ADD CONSTRAINT "requirement_broadcast_recipients_inventoryPartnerId_fkey" FOREIGN KEY ("inventoryPartnerId") REFERENCES "inventory_partners"("id") ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='match_recommendations_organizationId_fkey') THEN ALTER TABLE "match_recommendations" ADD CONSTRAINT "match_recommendations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='match_recommendations_leadId_fkey') THEN ALTER TABLE "match_recommendations" ADD CONSTRAINT "match_recommendations_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='match_recommendations_propertyId_fkey') THEN ALTER TABLE "match_recommendations" ADD CONSTRAINT "match_recommendations_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='match_recommendations_handledById_fkey') THEN ALTER TABLE "match_recommendations" ADD CONSTRAINT "match_recommendations_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF;
END $$;
