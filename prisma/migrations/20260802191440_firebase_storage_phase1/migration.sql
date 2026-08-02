-- CreateEnum
CREATE TYPE "PropertyImagePurpose" AS ENUM ('IMAGE', 'FLOOR_PLAN');

-- CreateEnum
CREATE TYPE "PropertyImageStatus" AS ENUM ('ACTIVE', 'DELETED');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('GENERAL', 'AADHAAR', 'PAN', 'REGISTRY', 'OWNERSHIP_PROOF', 'RENT_AGREEMENT', 'SALE_AGREEMENT', 'BROKERAGE_AGREEMENT', 'DEAL_DOCUMENT', 'PAYMENT_RECEIPT', 'OWNER_IDENTITY');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "category" "DocumentCategory" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "originalFilename" TEXT,
ADD COLUMN     "storageBucket" TEXT,
ADD COLUMN     "storageProvider" TEXT;

-- CreateTable
CREATE TABLE "property_images" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "propertyId" TEXT NOT NULL,
    "purpose" "PropertyImagePurpose" NOT NULL DEFAULT 'IMAGE',
    "status" "PropertyImageStatus" NOT NULL DEFAULT 'ACTIVE',
    "storageProvider" TEXT NOT NULL,
    "storageBucket" TEXT,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "property_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_images_organizationId_propertyId_idx" ON "property_images"("organizationId", "propertyId");

-- CreateIndex
CREATE INDEX "property_images_propertyId_status_sortOrder_idx" ON "property_images"("propertyId", "status", "sortOrder");

-- AddForeignKey
ALTER TABLE "property_images" ADD CONSTRAINT "property_images_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_images" ADD CONSTRAINT "property_images_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_images" ADD CONSTRAINT "property_images_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
