-- Phase 7 manual production migration. Additive and idempotent; review before running.
ALTER TYPE "ImportStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "ImportStatus" ADD VALUE IF NOT EXISTS 'RUNNING';
ALTER TYPE "ImportStatus" ADD VALUE IF NOT EXISTS 'COMPLETED_WITH_ERRORS';
ALTER TYPE "ImportRecordStatus" ADD VALUE IF NOT EXISTS 'WARNING';
ALTER TYPE "ImportRecordStatus" ADD VALUE IF NOT EXISTS 'FAILED';

DO $$ BEGIN CREATE TYPE "InventoryImportMode" AS ENUM ('CREATE_ONLY','UPSERT_SAFE','UPDATE_EXISTING_ONLY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ImportPartialPolicy" AS ENUM ('REQUIRE_ALL_ROWS_VALID','IMPORT_VALID_ROWS'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PropertyDuplicateClass" AS ENUM ('EXACT_DUPLICATE','PROBABLE_DUPLICATE','POSSIBLE_DUPLICATE','NEW'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PropertyImportAction" AS ENUM ('CREATE','UPDATE_EXISTING','SKIP'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE "InventoryImportMode" ADD VALUE IF NOT EXISTS 'CREATE_ONLY';
ALTER TYPE "InventoryImportMode" ADD VALUE IF NOT EXISTS 'UPSERT_SAFE';
ALTER TYPE "InventoryImportMode" ADD VALUE IF NOT EXISTS 'UPDATE_EXISTING_ONLY';
ALTER TYPE "ImportPartialPolicy" ADD VALUE IF NOT EXISTS 'REQUIRE_ALL_ROWS_VALID';
ALTER TYPE "ImportPartialPolicy" ADD VALUE IF NOT EXISTS 'IMPORT_VALID_ROWS';
ALTER TYPE "PropertyDuplicateClass" ADD VALUE IF NOT EXISTS 'EXACT_DUPLICATE';
ALTER TYPE "PropertyDuplicateClass" ADD VALUE IF NOT EXISTS 'PROBABLE_DUPLICATE';
ALTER TYPE "PropertyDuplicateClass" ADD VALUE IF NOT EXISTS 'POSSIBLE_DUPLICATE';
ALTER TYPE "PropertyDuplicateClass" ADD VALUE IF NOT EXISTS 'NEW';
ALTER TYPE "PropertyImportAction" ADD VALUE IF NOT EXISTS 'CREATE';
ALTER TYPE "PropertyImportAction" ADD VALUE IF NOT EXISTS 'UPDATE_EXISTING';
ALTER TYPE "PropertyImportAction" ADD VALUE IF NOT EXISTS 'SKIP';

ALTER TABLE "import_jobs" ADD COLUMN IF NOT EXISTS "sheetName" TEXT;
ALTER TABLE "import_jobs" ADD COLUMN IF NOT EXISTS "importMode" "InventoryImportMode" NOT NULL DEFAULT 'CREATE_ONLY';
ALTER TABLE "import_jobs" ADD COLUMN IF NOT EXISTS "partialPolicy" "ImportPartialPolicy" NOT NULL DEFAULT 'REQUIRE_ALL_ROWS_VALID';
ALTER TABLE "import_jobs" ADD COLUMN IF NOT EXISTS "allowBlankClear" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "import_jobs" ADD COLUMN IF NOT EXISTS "fileHash" TEXT;
ALTER TABLE "import_jobs" ADD COLUMN IF NOT EXISTS "warningRows" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "import_jobs" ADD COLUMN IF NOT EXISTS "errorRows" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "import_jobs" ADD COLUMN IF NOT EXISTS "createdRows" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "import_jobs" ADD COLUMN IF NOT EXISTS "updatedRows" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "import_jobs" ADD COLUMN IF NOT EXISTS "skippedRows" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "import_jobs" ADD COLUMN IF NOT EXISTS "failedRows" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "import_jobs" ADD COLUMN IF NOT EXISTS "rolledBackAt" TIMESTAMP(3);
ALTER TABLE "import_records" ADD COLUMN IF NOT EXISTS "action" "PropertyImportAction";
ALTER TABLE "import_records" ADD COLUMN IF NOT EXISTS "duplicateClass" "PropertyDuplicateClass";
ALTER TABLE "import_records" ADD COLUMN IF NOT EXISTS "validationErrors" TEXT;
ALTER TABLE "import_records" ADD COLUMN IF NOT EXISTS "warnings" TEXT;
ALTER TABLE "import_records" ADD COLUMN IF NOT EXISTS "beforeSummary" TEXT;
ALTER TABLE "import_records" ADD COLUMN IF NOT EXISTS "afterSummary" TEXT;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "dimension" TEXT;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "possessionNotes" TEXT;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "liftAvailable" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "import_mapping_presets" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL DEFAULT 'org_default', "name" TEXT NOT NULL,
  "entityType" "ImportEntityType" NOT NULL DEFAULT 'PROPERTIES', "headerSignature" TEXT NOT NULL,
  "columnMapping" TEXT NOT NULL, "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "import_mapping_presets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "import_mapping_presets_organizationId_name_key" ON "import_mapping_presets"("organizationId","name");
CREATE INDEX IF NOT EXISTS "import_mapping_presets_organizationId_entityType_idx" ON "import_mapping_presets"("organizationId","entityType");
CREATE INDEX IF NOT EXISTS "import_mapping_presets_organizationId_headerSignature_idx" ON "import_mapping_presets"("organizationId","headerSignature");
CREATE INDEX IF NOT EXISTS "import_jobs_organizationId_createdAt_idx" ON "import_jobs"("organizationId","createdAt");
CREATE INDEX IF NOT EXISTS "import_jobs_organizationId_status_idx" ON "import_jobs"("organizationId","status");

DO $$ BEGIN ALTER TABLE "import_mapping_presets" ADD CONSTRAINT "import_mapping_presets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "import_mapping_presets" ADD CONSTRAINT "import_mapping_presets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
