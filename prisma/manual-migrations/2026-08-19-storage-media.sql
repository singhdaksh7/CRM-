-- Additive, idempotent storage + property media migration.
-- Safe to re-run. Never drops existing PropertyImage/Document rows.

DO $$ BEGIN
  CREATE TYPE "MediaVisibility" AS ENUM ('PUBLIC', 'PRIVATE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "StorageUploadStatus" AS ENUM ('PENDING', 'UPLOADED', 'CONFIRMED', 'FAILED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE "DocumentCategory" ADD VALUE IF NOT EXISTS 'PROPERTY_BROCHURE';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "property_images" ADD COLUMN IF NOT EXISTS "visibility" "MediaVisibility" NOT NULL DEFAULT 'PUBLIC';
ALTER TABLE "property_images" ADD COLUMN IF NOT EXISTS "thumbnailKey" TEXT;
ALTER TABLE "property_images" ADD COLUMN IF NOT EXISTS "originalFilename" TEXT;

UPDATE "property_images" pi
SET "storageKey" = pi."storageKey" || '-dedupe-' || pi."id"
WHERE pi."id" IN (
  SELECT "id" FROM (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "storageKey" ORDER BY "createdAt") AS rn
    FROM "property_images"
  ) d
  WHERE d.rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "property_images_storageKey_key" ON "property_images"("storageKey");
CREATE INDEX IF NOT EXISTS "property_images_organizationId_status_idx" ON "property_images"("organizationId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "property_images_one_active_cover_per_property"
  ON "property_images"("propertyId")
  WHERE "isCover" = true AND "status" = 'ACTIVE';

CREATE TABLE IF NOT EXISTS "storage_upload_sessions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "actorId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "originalFilename" TEXT,
    "purpose" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "imagePurpose" "PropertyImagePurpose",
    "visibility" "MediaVisibility" NOT NULL DEFAULT 'PUBLIC',
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "caption" TEXT,
    "status" "StorageUploadStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "propertyImageId" TEXT,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "storage_upload_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "storage_upload_sessions_propertyImageId_key" ON "storage_upload_sessions"("propertyImageId");
CREATE UNIQUE INDEX IF NOT EXISTS "storage_upload_sessions_organizationId_objectKey_key" ON "storage_upload_sessions"("organizationId", "objectKey");
CREATE INDEX IF NOT EXISTS "storage_upload_sessions_organizationId_status_expiresAt_idx" ON "storage_upload_sessions"("organizationId", "status", "expiresAt");
CREATE INDEX IF NOT EXISTS "storage_upload_sessions_status_expiresAt_idx" ON "storage_upload_sessions"("status", "expiresAt");

DO $$ BEGIN
  ALTER TABLE "storage_upload_sessions" ADD CONSTRAINT "storage_upload_sessions_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "storage_upload_sessions" ADD CONSTRAINT "storage_upload_sessions_propertyImageId_fkey"
    FOREIGN KEY ("propertyImageId") REFERENCES "property_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
