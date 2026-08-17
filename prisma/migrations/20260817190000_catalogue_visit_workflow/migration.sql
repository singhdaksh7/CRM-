-- Catalogue -> Visit Scheduling -> Field Executive Visit workflow.
--
-- Scoped deliberately to only this feature's changes. `prisma migrate dev`
-- also reports pre-existing drift between schema.prisma and the committed
-- migration history (saved_views, properties.tags, extra NotificationType
-- values, several FK/index renames) that predates this branch - that drift is
-- intentionally NOT swept up here, exactly as the employee-auth-lifecycle
-- migration before it chose not to.
--
-- Everything below is additive. No column changes type or nullability, no
-- table is dropped, and "visits"."propertyId" stays NOT NULL so existing
-- single-property visits and every existing reader keep working unchanged.

-- AlterEnum
ALTER TYPE "VisitStatus" ADD VALUE 'IN_PROGRESS';

-- CreateEnum
CREATE TYPE "VisitPropertyStatus" AS ENUM ('PENDING', 'VISITED', 'SKIPPED', 'CLIENT_REJECTED', 'UNAVAILABLE');

-- AlterTable
ALTER TABLE "visits" ADD COLUMN     "catalogueShareId" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "overallRating" INTEGER,
ADD COLUMN     "completionSummary" TEXT,
ADD COLUMN     "cancellationReason" TEXT;

-- CreateTable
CREATE TABLE "visit_properties" (
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

-- CreateIndex
CREATE INDEX "visits_organizationId_visitDate_idx" ON "visits"("organizationId", "visitDate");

-- CreateIndex
CREATE INDEX "visits_organizationId_assignedToId_visitDate_idx" ON "visits"("organizationId", "assignedToId", "visitDate");

-- CreateIndex
CREATE UNIQUE INDEX "visit_properties_visitId_propertyId_key" ON "visit_properties"("visitId", "propertyId");

-- CreateIndex
CREATE INDEX "visit_properties_organizationId_propertyId_idx" ON "visit_properties"("organizationId", "propertyId");

-- CreateIndex
CREATE INDEX "visit_properties_visitId_sequence_idx" ON "visit_properties"("visitId", "sequence");

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_catalogueShareId_fkey" FOREIGN KEY ("catalogueShareId") REFERENCES "catalogue_shares"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_properties" ADD CONSTRAINT "visit_properties_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_properties" ADD CONSTRAINT "visit_properties_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_properties" ADD CONSTRAINT "visit_properties_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_properties" ADD CONSTRAINT "visit_properties_visitedById_fkey" FOREIGN KEY ("visitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill. Every pre-existing visit gets exactly one visit_properties row
-- mirroring its single "visits"."propertyId", so the new per-property readers
-- and the old single-property readers agree from the moment this is applied.
-- Status is derived from the visit's own status: an already-COMPLETED visit's
-- property reads as VISITED, everything else stays PENDING. No reaction
-- rating is invented - historical visits genuinely have no star data, and
-- the analytics guard against small/empty samples rather than fabricating one.
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

-- Existing completed visits get a completedAt so the new detail view and the
-- reporting module do not show a completed visit with no completion time.
UPDATE "visits" SET "completedAt" = "updatedAt" WHERE "status" = 'COMPLETED' AND "completedAt" IS NULL;
