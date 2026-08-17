-- Additive, idempotent Catalogue -> Visit -> Field Executive Visit migration.
--
-- Safe to run more than once and safe to run against a live database while
-- the previous application version is still serving traffic: every statement
-- is additive (new enum value, new enum type, new nullable columns, new
-- table, new indexes) plus one idempotent backfill. Nothing is dropped and
-- no existing column changes type or nullability.
--
-- Compatibility preflight:
--   * ALTER TYPE "VisitStatus" ADD VALUE requires PostgreSQL 12+ to run
--     inside a transaction block. On PostgreSQL 11 and earlier this file must
--     be run with autocommit (psql without -1). Every supported deployment
--     target for this project is PostgreSQL 14+, so the guarded DO block
--     below is transaction-safe as written. The new value is appended at the
--     END of the enum, so existing stored values keep their ordinals and no
--     table is rewritten.
--   * 'IN_PROGRESS' is not written by any code path until the new
--     application version is deployed, and the previous version never reads
--     it, so this file can be applied strictly BEFORE the deploy. The
--     previous version's Prisma client would throw on encountering an unknown
--     enum value, which is exactly why nothing writes it until after deploy.
--   * "visits"."propertyId" deliberately stays NOT NULL. A multi-property
--     visit stores its first property there, so every pre-existing reader
--     (visit-conflict detection, suggested-route, reports, the visits table
--     UI) is unaffected and needs no coordinated change.
--   * All seven new "visits" columns are nullable with no default, so adding
--     them is a metadata-only operation with no table rewrite, and the
--     previous application version simply ignores them.
--   * "visit_properties" has no dependants; it is only written by the new
--     code paths.
--   * The backfill is ON CONFLICT DO NOTHING against the
--     ("visitId","propertyId") unique index and uses a deterministic
--     'vp_bf_' || visit id primary key, so re-running it inserts nothing and
--     cannot duplicate rows. On a very large "visits" table it is a single
--     INSERT ... SELECT; run it off-peak if "visits" has millions of rows.

DO $$ BEGIN
  ALTER TYPE "VisitStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "VisitPropertyStatus" AS ENUM ('PENDING', 'VISITED', 'SKIPPED', 'CLIENT_REJECTED', 'UNAVAILABLE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "catalogueShareId" TEXT;
ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3);
ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "overallRating" INTEGER;
ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "completionSummary" TEXT;
ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;

-- Catalogue visit REQUESTS resolve onto a confirmed visit. A VISIT_REQUESTED
-- catalogue_interactions row is the client's request and books nothing;
-- "scheduledVisitId" is stamped only when an Admin confirms, and doubles as
-- the single-use guard that makes double-confirmation impossible. All three
-- columns are nullable with no default (metadata-only, no table rewrite) and
-- the previous application version simply ignores them.
ALTER TABLE "catalogue_interactions" ADD COLUMN IF NOT EXISTS "scheduledVisitId" TEXT;
ALTER TABLE "catalogue_interactions" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3);
ALTER TABLE "catalogue_interactions" ADD COLUMN IF NOT EXISTS "scheduledById" TEXT;

CREATE TABLE IF NOT EXISTS "visit_properties" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "visitId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "status" "VisitPropertyStatus" NOT NULL DEFAULT 'PENDING',
    "visitedAt" TIMESTAMP(3),
    "visitedById" TEXT,
    "reactionRating" INTEGER,
    "reactionNote" TEXT,
    "skipReason" TEXT,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "visit_properties_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "visits_organizationId_visitDate_idx" ON "visits"("organizationId", "visitDate");
CREATE INDEX IF NOT EXISTS "visits_organizationId_assignedToId_visitDate_idx" ON "visits"("organizationId", "assignedToId", "visitDate");
CREATE UNIQUE INDEX IF NOT EXISTS "visit_properties_visitId_propertyId_key" ON "visit_properties"("visitId", "propertyId");
CREATE INDEX IF NOT EXISTS "visit_properties_organizationId_propertyId_idx" ON "visit_properties"("organizationId", "propertyId");
CREATE INDEX IF NOT EXISTS "visit_properties_visitId_sequence_idx" ON "visit_properties"("visitId", "sequence");
CREATE INDEX IF NOT EXISTS "catalogue_interactions_organizationId_type_scheduledVisitId_idx" ON "catalogue_interactions"("organizationId", "type", "scheduledVisitId");

DO $$ BEGIN
  ALTER TABLE "visits" ADD CONSTRAINT "visits_catalogueShareId_fkey" FOREIGN KEY ("catalogueShareId") REFERENCES "catalogue_shares"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "visits" ADD CONSTRAINT "visits_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "visit_properties" ADD CONSTRAINT "visit_properties_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "visit_properties" ADD CONSTRAINT "visit_properties_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "visit_properties" ADD CONSTRAINT "visit_properties_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "visit_properties" ADD CONSTRAINT "visit_properties_visitedById_fkey" FOREIGN KEY ("visitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "catalogue_interactions" ADD CONSTRAINT "catalogue_interactions_scheduledVisitId_fkey" FOREIGN KEY ("scheduledVisitId") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "catalogue_interactions" ADD CONSTRAINT "catalogue_interactions_scheduledById_fkey" FOREIGN KEY ("scheduledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Idempotent backfill: one visit_properties row per pre-existing visit.
INSERT INTO "visit_properties" ("id", "organizationId", "visitId", "propertyId", "sequence", "status", "visitedAt", "visitedById", "isPreferred", "createdAt", "updatedAt")
SELECT
    'vp_bf_' || v."id",
    v."organizationId",
    v."id",
    v."propertyId",
    0,
    CASE WHEN v."status" = 'COMPLETED' THEN 'VISITED'::"VisitPropertyStatus" ELSE 'PENDING'::"VisitPropertyStatus" END,
    CASE WHEN v."status" = 'COMPLETED' THEN v."updatedAt" ELSE NULL END,
    CASE WHEN v."status" = 'COMPLETED' THEN v."assignedToId" ELSE NULL END,
    false,
    v."createdAt",
    v."updatedAt"
FROM "visits" v
ON CONFLICT ("visitId", "propertyId") DO NOTHING;

UPDATE "visits" SET "completedAt" = "updatedAt" WHERE "status" = 'COMPLETED' AND "completedAt" IS NULL;
