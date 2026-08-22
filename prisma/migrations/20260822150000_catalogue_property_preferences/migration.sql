-- Additive: CataloguePropertyPreference for mutable client like/dislike
-- state on public catalogues. Does not alter CatalogueInteraction (append-only
-- event log). Safe to apply after origin/main chain; timestamp chosen to avoid
-- collision with parallel-branch migrations:
--   20260822120000_simplified_role_workflow_additive
--   20260822130000_followup_cancelled_status

DO $$ BEGIN
  CREATE TYPE "CataloguePropertyPreferenceStatus" AS ENUM ('UNDECIDED', 'LIKED', 'NOT_INTERESTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "catalogue_property_preferences" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL DEFAULT 'org_default',
  "catalogueShareId" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "status" "CataloguePropertyPreferenceStatus" NOT NULL DEFAULT 'UNDECIDED',
  "note" TEXT,
  "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "catalogue_property_preferences_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "catalogue_property_preferences_catalogueShareId_fkey"
    FOREIGN KEY ("catalogueShareId") REFERENCES "catalogue_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "catalogue_property_preferences_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "catalogue_property_preferences_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "catalogue_property_preferences_catalogueShareId_propertyId_key"
  ON "catalogue_property_preferences"("catalogueShareId", "propertyId");

CREATE INDEX IF NOT EXISTS "catalogue_property_preferences_organizationId_leadId_status_idx"
  ON "catalogue_property_preferences"("organizationId", "leadId", "status");

CREATE INDEX IF NOT EXISTS "catalogue_property_preferences_leadId_status_idx"
  ON "catalogue_property_preferences"("leadId", "status");

CREATE INDEX IF NOT EXISTS "catalogue_property_preferences_organizationId_catalogueShareId_idx"
  ON "catalogue_property_preferences"("organizationId", "catalogueShareId");
