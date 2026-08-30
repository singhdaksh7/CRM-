-- Phase A / A8 - reusable, organization-scoped PropertyLocality.
--
-- Fully additive: a new table, plus a nullable "localityId" column on
-- "properties". "properties"."area" (the existing free-text locality
-- string) is completely untouched - every current reader (matching engine,
-- reporting, public/catalogue DTOs) keeps working unchanged. No backfill is
-- performed here: application code (resolveOrCreatePropertyLocality)
-- populates "localityId" going forward on property create/edit, so
-- existing rows simply have localityId = NULL until next touched. This is
-- intentional - a backfill that guesses at existing free-text `area`
-- values into locality rows is a data-quality decision best made
-- deliberately (e.g. a one-off admin action), not silently inside a schema
-- migration.
CREATE TABLE "property_localities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_localities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "property_localities_organizationId_normalizedName_key" ON "property_localities"("organizationId", "normalizedName");

CREATE INDEX "property_localities_organizationId_name_idx" ON "property_localities"("organizationId", "name");

ALTER TABLE "property_localities" ADD CONSTRAINT "property_localities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "property_localities" ADD CONSTRAINT "property_localities_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "properties" ADD COLUMN     "localityId" TEXT;

CREATE INDEX "properties_localityId_idx" ON "properties"("localityId");

ALTER TABLE "properties" ADD CONSTRAINT "properties_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "property_localities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
