-- Phase 7: additive inventory spreadsheet import and bulk-management history.
ALTER TYPE "ImportStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "ImportStatus" ADD VALUE IF NOT EXISTS 'RUNNING';
ALTER TYPE "ImportStatus" ADD VALUE IF NOT EXISTS 'COMPLETED_WITH_ERRORS';
ALTER TYPE "ImportRecordStatus" ADD VALUE IF NOT EXISTS 'WARNING';
ALTER TYPE "ImportRecordStatus" ADD VALUE IF NOT EXISTS 'FAILED';

CREATE TYPE "InventoryImportMode" AS ENUM ('CREATE_ONLY', 'UPSERT_SAFE', 'UPDATE_EXISTING_ONLY');
CREATE TYPE "ImportPartialPolicy" AS ENUM ('REQUIRE_ALL_ROWS_VALID', 'IMPORT_VALID_ROWS');
CREATE TYPE "PropertyDuplicateClass" AS ENUM ('EXACT_DUPLICATE', 'PROBABLE_DUPLICATE', 'POSSIBLE_DUPLICATE', 'NEW');
CREATE TYPE "PropertyImportAction" AS ENUM ('CREATE', 'UPDATE_EXISTING', 'SKIP');

ALTER TABLE "import_jobs"
  ADD COLUMN "sheetName" TEXT,
  ADD COLUMN "importMode" "InventoryImportMode" NOT NULL DEFAULT 'CREATE_ONLY',
  ADD COLUMN "partialPolicy" "ImportPartialPolicy" NOT NULL DEFAULT 'REQUIRE_ALL_ROWS_VALID',
  ADD COLUMN "allowBlankClear" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "fileHash" TEXT,
  ADD COLUMN "warningRows" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "errorRows" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "createdRows" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "updatedRows" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "skippedRows" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "failedRows" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rolledBackAt" TIMESTAMP(3);

ALTER TABLE "import_records"
  ADD COLUMN "action" "PropertyImportAction",
  ADD COLUMN "duplicateClass" "PropertyDuplicateClass",
  ADD COLUMN "validationErrors" TEXT,
  ADD COLUMN "warnings" TEXT,
  ADD COLUMN "beforeSummary" TEXT,
  ADD COLUMN "afterSummary" TEXT;

ALTER TABLE "properties"
  ADD COLUMN "dimension" TEXT,
  ADD COLUMN "possessionNotes" TEXT,
  ADD COLUMN "liftAvailable" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "import_mapping_presets" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'org_default',
  "name" TEXT NOT NULL,
  "entityType" "ImportEntityType" NOT NULL DEFAULT 'PROPERTIES',
  "headerSignature" TEXT NOT NULL,
  "columnMapping" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "import_mapping_presets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "import_mapping_presets_organizationId_name_key" ON "import_mapping_presets"("organizationId", "name");
CREATE INDEX "import_mapping_presets_organizationId_entityType_idx" ON "import_mapping_presets"("organizationId", "entityType");
CREATE INDEX "import_mapping_presets_organizationId_headerSignature_idx" ON "import_mapping_presets"("organizationId", "headerSignature");
CREATE INDEX "import_jobs_organizationId_createdAt_idx" ON "import_jobs"("organizationId", "createdAt");
CREATE INDEX "import_jobs_organizationId_status_idx" ON "import_jobs"("organizationId", "status");

ALTER TABLE "import_mapping_presets" ADD CONSTRAINT "import_mapping_presets_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "import_mapping_presets" ADD CONSTRAINT "import_mapping_presets_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
