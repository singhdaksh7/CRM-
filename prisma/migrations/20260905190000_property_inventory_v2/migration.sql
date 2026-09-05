-- CreateEnum
CREATE TYPE "PropertyAreaUnit" AS ENUM ('SQ_FT', 'SQ_YD', 'SQ_M', 'ACRE', 'OTHER');

-- CreateEnum
CREATE TYPE "PossessionStatus" AS ENUM ('READY_TO_MOVE', 'UNDER_CONSTRUCTION', 'BOOKING', 'TENANTED', 'UNKNOWN');

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "areaRaw" TEXT,
ADD COLUMN     "areaUnit" "PropertyAreaUnit",
ADD COLUMN     "floorRaw" TEXT,
ADD COLUMN     "lastPrice" INTEGER,
ADD COLUMN     "parkFacing" BOOLEAN,
ADD COLUMN     "possessionStatus" "PossessionStatus",
ADD COLUMN     "priceRaw" TEXT,
ADD COLUMN     "sourceRaw" TEXT,
ALTER COLUMN "furnishing" DROP NOT NULL;

-- CreateTable
CREATE TABLE "property_locality_aliases" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "normalizedAlias" TEXT NOT NULL,
    "localityId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_locality_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_locality_aliases_localityId_idx" ON "property_locality_aliases"("localityId");

-- CreateIndex
CREATE UNIQUE INDEX "property_locality_aliases_organizationId_normalizedAlias_key" ON "property_locality_aliases"("organizationId", "normalizedAlias");

-- AddForeignKey
ALTER TABLE "property_locality_aliases" ADD CONSTRAINT "property_locality_aliases_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_locality_aliases" ADD CONSTRAINT "property_locality_aliases_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "property_localities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_locality_aliases" ADD CONSTRAINT "property_locality_aliases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

