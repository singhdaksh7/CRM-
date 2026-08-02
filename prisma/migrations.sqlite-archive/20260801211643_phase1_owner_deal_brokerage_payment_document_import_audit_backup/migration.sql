-- CreateTable
CREATE TABLE "owners" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "ownerCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "alternatePhone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT NOT NULL DEFAULT 'Delhi',
    "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedAt" DATETIME,
    "verifiedById" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "owners_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "owners_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "owners_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "dealCode" TEXT NOT NULL,
    "dealType" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'INQUIRY',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "leadId" TEXT,
    "propertyId" TEXT,
    "ownerId" TEXT,
    "agreedAmount" INTEGER,
    "brokeragePct" REAL,
    "brokerageAmount" INTEGER,
    "assignedToId" TEXT,
    "expectedCloseDate" DATETIME,
    "closedAt" DATETIME,
    "lostReason" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "deals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "deals_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "deals_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "deals_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "deals_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "deals_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "brokerage_calculations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "dealId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "baseAmount" INTEGER NOT NULL,
    "brokeragePct" REAL,
    "grossBrokerage" INTEGER NOT NULL,
    "splitPct" REAL,
    "splitWithUserId" TEXT,
    "splitAmount" INTEGER,
    "discountPct" REAL,
    "discountAmount" INTEGER,
    "taxPct" REAL,
    "taxAmount" INTEGER,
    "netBrokerage" INTEGER NOT NULL,
    "employeeIncentivePct" REAL,
    "employeeIncentiveAmount" INTEGER,
    "employeeId" TEXT,
    "notes" TEXT,
    "calculatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "brokerage_calculations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "brokerage_calculations_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "brokerage_calculations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "brokerage_calculations_calculatedById_fkey" FOREIGN KEY ("calculatedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "dealId" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'RECEIVABLE',
    "amount" INTEGER NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueDate" DATETIME,
    "paidAt" DATETIME,
    "receiptNumber" TEXT,
    "referenceNote" TEXT,
    "recordedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payments_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "entityType" TEXT NOT NULL,
    "propertyId" TEXT,
    "leadId" TEXT,
    "ownerId" TEXT,
    "dealId" TEXT,
    "paymentId" TEXT,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previousDocumentId" TEXT,
    "uploadedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "documents_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "documents_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "documents_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "documents_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "documents_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "documents_previousDocumentId_fkey" FOREIGN KEY ("previousDocumentId") REFERENCES "documents" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "entityType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "columnMapping" TEXT NOT NULL,
    "errorLog" TEXT,
    "createdById" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "import_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "import_jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "import_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importJobId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "rawData" TEXT NOT NULL,
    "errorMessage" TEXT,
    "entityId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "import_records_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "import_jobs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValues" TEXT,
    "newValues" TEXT,
    "ipAddress" TEXT,
    "device" TEXT,
    "result" TEXT NOT NULL DEFAULT 'SUCCESS',
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "backup_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "type" TEXT NOT NULL DEFAULT 'FULL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "triggeredById" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "sizeBytes" INTEGER,
    "location" TEXT,
    "checksum" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "backup_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "backup_records_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "restore_validations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "backupRecordId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "validatedById" TEXT,
    "validatedAt" DATETIME,
    "issuesFound" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "restore_validations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "restore_validations_backupRecordId_fkey" FOREIGN KEY ("backupRecordId") REFERENCES "backup_records" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "restore_validations_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_activities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "leadId" TEXT,
    "crmOwnerId" TEXT,
    "dealId" TEXT,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "activities_crmOwnerId_fkey" FOREIGN KEY ("crmOwnerId") REFERENCES "owners" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "activities_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "activities_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_activities" ("actorId", "createdAt", "description", "id", "leadId", "metadata", "organizationId", "type") SELECT "actorId", "createdAt", "description", "id", "leadId", "metadata", "organizationId", "type" FROM "activities";
DROP TABLE "activities";
ALTER TABLE "new_activities" RENAME TO "activities";
CREATE INDEX "activities_crmOwnerId_idx" ON "activities"("crmOwnerId");
CREATE INDEX "activities_dealId_idx" ON "activities"("dealId");
CREATE TABLE "new_follow_ups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "leadId" TEXT,
    "crmOwnerId" TEXT,
    "ownerId" TEXT,
    "type" TEXT NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "follow_ups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "follow_ups_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "follow_ups_crmOwnerId_fkey" FOREIGN KEY ("crmOwnerId") REFERENCES "owners" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "follow_ups_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_follow_ups" ("completedAt", "createdAt", "dueDate", "id", "leadId", "notes", "organizationId", "ownerId", "status", "type", "updatedAt") SELECT "completedAt", "createdAt", "dueDate", "id", "leadId", "notes", "organizationId", "ownerId", "status", "type", "updatedAt" FROM "follow_ups";
DROP TABLE "follow_ups";
ALTER TABLE "new_follow_ups" RENAME TO "follow_ups";
CREATE TABLE "new_properties" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "propertyCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "propertyType" TEXT NOT NULL,
    "listingType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "description" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'Delhi',
    "area" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "landmark" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "monthlyRent" INTEGER,
    "securityDeposit" INTEGER,
    "maintenanceCharge" INTEGER,
    "rentBrokerage" INTEGER,
    "salePrice" INTEGER,
    "pricePerSqft" INTEGER,
    "saleBrokeragePct" REAL,
    "saleBrokerageAmount" INTEGER,
    "negotiable" BOOLEAN NOT NULL DEFAULT false,
    "bhk" INTEGER NOT NULL,
    "bathrooms" INTEGER NOT NULL,
    "balconies" INTEGER NOT NULL DEFAULT 0,
    "furnishing" TEXT NOT NULL,
    "floorNumber" INTEGER,
    "totalFloors" INTEGER,
    "propertyAgeYears" INTEGER,
    "builtUpAreaSqft" INTEGER NOT NULL,
    "carpetAreaSqft" INTEGER,
    "facing" TEXT,
    "parkingAvailable" BOOLEAN NOT NULL DEFAULT false,
    "tenantPreference" TEXT,
    "availableFrom" DATETIME,
    "amenities" TEXT NOT NULL DEFAULT '[]',
    "images" TEXT NOT NULL DEFAULT '[]',
    "coverImage" TEXT,
    "videoUrl" TEXT,
    "virtualTourUrl" TEXT,
    "floorPlanImage" TEXT,
    "ownerName" TEXT NOT NULL,
    "ownerPhone" TEXT NOT NULL,
    "ownerAlternatePhone" TEXT,
    "ownerNotes" TEXT,
    "ownerId" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "properties_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "properties_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "properties_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_properties" ("address", "amenities", "area", "availableFrom", "balconies", "bathrooms", "bhk", "builtUpAreaSqft", "carpetAreaSqft", "city", "coverImage", "createdAt", "createdById", "description", "facing", "floorNumber", "floorPlanImage", "furnishing", "id", "images", "landmark", "latitude", "listingType", "longitude", "maintenanceCharge", "monthlyRent", "negotiable", "organizationId", "ownerAlternatePhone", "ownerName", "ownerNotes", "ownerPhone", "parkingAvailable", "pricePerSqft", "propertyAgeYears", "propertyCode", "propertyType", "rentBrokerage", "saleBrokerageAmount", "saleBrokeragePct", "salePrice", "securityDeposit", "status", "tenantPreference", "title", "totalFloors", "updatedAt", "videoUrl", "virtualTourUrl") SELECT "address", "amenities", "area", "availableFrom", "balconies", "bathrooms", "bhk", "builtUpAreaSqft", "carpetAreaSqft", "city", "coverImage", "createdAt", "createdById", "description", "facing", "floorNumber", "floorPlanImage", "furnishing", "id", "images", "landmark", "latitude", "listingType", "longitude", "maintenanceCharge", "monthlyRent", "negotiable", "organizationId", "ownerAlternatePhone", "ownerName", "ownerNotes", "ownerPhone", "parkingAvailable", "pricePerSqft", "propertyAgeYears", "propertyCode", "propertyType", "rentBrokerage", "saleBrokerageAmount", "saleBrokeragePct", "salePrice", "securityDeposit", "status", "tenantPreference", "title", "totalFloors", "updatedAt", "videoUrl", "virtualTourUrl" FROM "properties";
DROP TABLE "properties";
ALTER TABLE "new_properties" RENAME TO "properties";
CREATE UNIQUE INDEX "properties_propertyCode_key" ON "properties"("propertyCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "owners_ownerCode_key" ON "owners"("ownerCode");

-- CreateIndex
CREATE INDEX "owners_organizationId_verificationStatus_idx" ON "owners"("organizationId", "verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "deals_dealCode_key" ON "deals"("dealCode");

-- CreateIndex
CREATE INDEX "deals_organizationId_status_idx" ON "deals"("organizationId", "status");

-- CreateIndex
CREATE INDEX "deals_organizationId_stage_idx" ON "deals"("organizationId", "stage");

-- CreateIndex
CREATE INDEX "brokerage_calculations_organizationId_dealId_idx" ON "brokerage_calculations"("organizationId", "dealId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_receiptNumber_key" ON "payments"("receiptNumber");

-- CreateIndex
CREATE INDEX "payments_organizationId_dealId_idx" ON "payments"("organizationId", "dealId");

-- CreateIndex
CREATE INDEX "payments_organizationId_status_idx" ON "payments"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "documents_previousDocumentId_key" ON "documents"("previousDocumentId");

-- CreateIndex
CREATE INDEX "documents_organizationId_entityType_idx" ON "documents"("organizationId", "entityType");

-- CreateIndex
CREATE INDEX "documents_propertyId_idx" ON "documents"("propertyId");

-- CreateIndex
CREATE INDEX "documents_leadId_idx" ON "documents"("leadId");

-- CreateIndex
CREATE INDEX "documents_ownerId_idx" ON "documents"("ownerId");

-- CreateIndex
CREATE INDEX "documents_dealId_idx" ON "documents"("dealId");

-- CreateIndex
CREATE INDEX "import_jobs_organizationId_entityType_idx" ON "import_jobs"("organizationId", "entityType");

-- CreateIndex
CREATE INDEX "import_records_importJobId_status_idx" ON "import_records"("importJobId", "status");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_entityType_entityId_idx" ON "audit_logs"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_userId_createdAt_idx" ON "audit_logs"("organizationId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "backup_records_organizationId_status_idx" ON "backup_records"("organizationId", "status");
