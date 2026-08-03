-- CreateEnum
CREATE TYPE "GeocodeStatus" AS ENUM ('NOT_ATTEMPTED', 'PENDING', 'SUCCESS', 'FAILED', 'MANUAL');

-- CreateEnum
CREATE TYPE "LocationPrecision" AS ENUM ('EXACT', 'APPROXIMATE', 'LOCALITY_ONLY', 'HIDDEN');

-- CreateEnum
CREATE TYPE "VisitConflictStatus" AS ENUM ('NONE', 'WARNING', 'OVERRIDDEN');

-- CreateEnum
CREATE TYPE "RouteSource" AS ENUM ('GOOGLE', 'ESTIMATED', 'NONE');

-- AlterTable: additive-only Property location metadata. Every new column is
-- nullable or has a safe default, so existing rows need no backfill and no
-- existing query/write path is affected.
ALTER TABLE "properties" ADD COLUMN     "pincode" TEXT,
ADD COLUMN     "formattedAddress" TEXT,
ADD COLUMN     "placeId" TEXT,
ADD COLUMN     "geocodeStatus" "GeocodeStatus" NOT NULL DEFAULT 'NOT_ATTEMPTED',
ADD COLUMN     "geocodedAt" TIMESTAMP(3),
ADD COLUMN     "locationPrecision" "LocationPrecision" NOT NULL DEFAULT 'APPROXIMATE',
ADD COLUMN     "publicLocationMode" "LocationPrecision" NOT NULL DEFAULT 'LOCALITY_ONLY';

-- AlterTable: additive-only Visit route/conflict metadata.
ALTER TABLE "visits" ADD COLUMN     "travelDurationMinutes" INTEGER,
ADD COLUMN     "travelDistanceMeters" INTEGER,
ADD COLUMN     "routeCheckedAt" TIMESTAMP(3),
ADD COLUMN     "routeSource" "RouteSource" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "conflictStatus" "VisitConflictStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "conflictDetail" TEXT,
ADD COLUMN     "conflictOverrideReason" TEXT,
ADD COLUMN     "conflictOverrideByUserId" TEXT,
ADD COLUMN     "conflictOverrideAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_conflictOverrideByUserId_fkey" FOREIGN KEY ("conflictOverrideByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
