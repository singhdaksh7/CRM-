-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "settings" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Seed the default organization every existing + new row's organizationId
-- literal default ('org_default') points at. Required before any table
-- below can be rebuilt with a NOT NULL organizationId + FK constraint.
INSERT INTO "organizations" ("id", "name", "slug", "phone", "email", "address", "timezone", "currency", "settings", "createdAt", "updatedAt")
VALUES ('org_default', 'Delhi Broker CRM', 'delhi-broker-crm', '+919811100001', 'admin@delhibrokercrm.com', 'Delhi, India', 'Asia/Kolkata', 'INR', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- CreateTable
CREATE TABLE "lead_assignment_rules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "name" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "source" TEXT,
    "requirementType" TEXT,
    "locality" TEXT,
    "employeeId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "lead_assignment_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "lead_assignment_rules_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "employee_service_areas" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "employeeId" TEXT NOT NULL,
    "locality" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'Delhi',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employee_service_areas_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "employee_service_areas_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "userId" TEXT,
    "role" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "leadId" TEXT,
    "visitId" TEXT,
    "propertyId" TEXT,
    "followUpId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "lead_score_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "leadId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "priority" TEXT NOT NULL,
    "factors" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lead_score_history_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "lead_score_history_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_activities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "leadId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "activities_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_activities" ("actorId", "createdAt", "description", "id", "leadId", "metadata", "type") SELECT "actorId", "createdAt", "description", "id", "leadId", "metadata", "type" FROM "activities";
DROP TABLE "activities";
ALTER TABLE "new_activities" RENAME TO "activities";
CREATE TABLE "new_follow_ups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "leadId" TEXT NOT NULL,
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
    CONSTRAINT "follow_ups_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_follow_ups" ("completedAt", "createdAt", "dueDate", "id", "leadId", "notes", "ownerId", "status", "type", "updatedAt") SELECT "completedAt", "createdAt", "dueDate", "id", "leadId", "notes", "ownerId", "status", "type", "updatedAt" FROM "follow_ups";
DROP TABLE "follow_ups";
ALTER TABLE "new_follow_ups" RENAME TO "follow_ups";
CREATE TABLE "new_lead_transfers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "leadId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lead_transfers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "lead_transfers_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "lead_transfers_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "lead_transfers_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_lead_transfers" ("createdAt", "fromUserId", "id", "leadId", "reason", "toUserId") SELECT "createdAt", "fromUserId", "id", "leadId", "reason", "toUserId" FROM "lead_transfers";
DROP TABLE "lead_transfers";
ALTER TABLE "new_lead_transfers" RENAME TO "lead_transfers";
CREATE TABLE "new_leads" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "leadCode" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "source" TEXT NOT NULL,
    "externalLeadId" TEXT,
    "requirementType" TEXT NOT NULL,
    "preferredLocation" TEXT NOT NULL,
    "minBudget" INTEGER NOT NULL,
    "maxBudget" INTEGER NOT NULL,
    "preferredBhk" INTEGER,
    "furnishingPref" TEXT,
    "moveInDate" DATETIME,
    "additionalRequirements" TEXT,
    "assignedToId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "priority" TEXT NOT NULL DEFAULT 'WARM',
    "assignmentStrategy" TEXT,
    "assignmentReason" TEXT,
    "autoAssignedAt" DATETIME,
    "score" INTEGER NOT NULL DEFAULT 0,
    "scoreExplanation" TEXT,
    "scoreUpdatedAt" DATETIME,
    "lastContactedAt" DATETIME,
    "nextFollowUpAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "leads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "leads_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_leads" ("additionalRequirements", "assignedToId", "clientName", "createdAt", "email", "externalLeadId", "furnishingPref", "id", "lastContactedAt", "leadCode", "maxBudget", "minBudget", "moveInDate", "nextFollowUpAt", "notes", "phone", "preferredBhk", "preferredLocation", "priority", "requirementType", "source", "status", "updatedAt") SELECT "additionalRequirements", "assignedToId", "clientName", "createdAt", "email", "externalLeadId", "furnishingPref", "id", "lastContactedAt", "leadCode", "maxBudget", "minBudget", "moveInDate", "nextFollowUpAt", "notes", "phone", "preferredBhk", "preferredLocation", "priority", "requirementType", "source", "status", "updatedAt" FROM "leads";
DROP TABLE "leads";
ALTER TABLE "new_leads" RENAME TO "leads";
CREATE UNIQUE INDEX "leads_leadCode_key" ON "leads"("leadCode");
CREATE UNIQUE INDEX "leads_externalLeadId_key" ON "leads"("externalLeadId");
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
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "properties_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "properties_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_properties" ("address", "amenities", "area", "availableFrom", "balconies", "bathrooms", "bhk", "builtUpAreaSqft", "carpetAreaSqft", "city", "coverImage", "createdAt", "createdById", "description", "facing", "floorNumber", "floorPlanImage", "furnishing", "id", "images", "landmark", "latitude", "listingType", "longitude", "maintenanceCharge", "monthlyRent", "negotiable", "ownerAlternatePhone", "ownerName", "ownerNotes", "ownerPhone", "parkingAvailable", "pricePerSqft", "propertyAgeYears", "propertyCode", "propertyType", "rentBrokerage", "saleBrokerageAmount", "saleBrokeragePct", "salePrice", "securityDeposit", "status", "tenantPreference", "title", "totalFloors", "updatedAt", "videoUrl", "virtualTourUrl") SELECT "address", "amenities", "area", "availableFrom", "balconies", "bathrooms", "bhk", "builtUpAreaSqft", "carpetAreaSqft", "city", "coverImage", "createdAt", "createdById", "description", "facing", "floorNumber", "floorPlanImage", "furnishing", "id", "images", "landmark", "latitude", "listingType", "longitude", "maintenanceCharge", "monthlyRent", "negotiable", "ownerAlternatePhone", "ownerName", "ownerNotes", "ownerPhone", "parkingAvailable", "pricePerSqft", "propertyAgeYears", "propertyCode", "propertyType", "rentBrokerage", "saleBrokerageAmount", "saleBrokeragePct", "salePrice", "securityDeposit", "status", "tenantPreference", "title", "totalFloors", "updatedAt", "videoUrl", "virtualTourUrl" FROM "properties";
DROP TABLE "properties";
ALTER TABLE "new_properties" RENAME TO "properties";
CREATE UNIQUE INDEX "properties_propertyCode_key" ON "properties"("propertyCode");
CREATE TABLE "new_shared_property_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "leadId" TEXT NOT NULL,
    "propertyIds" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sharedById" TEXT,
    "whatsappLink" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "propertyId" TEXT,
    CONSTRAINT "shared_property_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shared_property_logs_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shared_property_logs_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "shared_property_logs_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_shared_property_logs" ("createdAt", "id", "leadId", "message", "propertyId", "propertyIds", "sharedById", "whatsappLink") SELECT "createdAt", "id", "leadId", "message", "propertyId", "propertyIds", "sharedById", "whatsappLink" FROM "shared_property_logs";
DROP TABLE "shared_property_logs";
ALTER TABLE "new_shared_property_logs" RENAME TO "shared_property_logs";
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "maxActiveLeads" INTEGER NOT NULL DEFAULT 20,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "speciality" TEXT NOT NULL DEFAULT 'ALL',
    "autoAssignEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_users" ("createdAt", "email", "id", "name", "notes", "passwordHash", "phone", "role", "status", "updatedAt") SELECT "createdAt", "email", "id", "name", "notes", "passwordHash", "phone", "role", "status", "updatedAt" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE TABLE "new_visits" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "leadId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "assignedToId" TEXT,
    "visitDate" DATETIME NOT NULL,
    "visitTime" TEXT NOT NULL,
    "meetingLocation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "clientFeedback" TEXT,
    "employeeNotes" TEXT,
    "outcome" TEXT,
    "followUpAction" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "visits_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "visits_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "visits_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "visits_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_visits" ("assignedToId", "clientFeedback", "createdAt", "employeeNotes", "followUpAction", "id", "leadId", "meetingLocation", "outcome", "propertyId", "status", "updatedAt", "visitDate", "visitTime") SELECT "assignedToId", "clientFeedback", "createdAt", "employeeNotes", "followUpAction", "id", "leadId", "meetingLocation", "outcome", "propertyId", "status", "updatedAt", "visitDate", "visitTime" FROM "visits";
DROP TABLE "visits";
ALTER TABLE "new_visits" RENAME TO "visits";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "employee_service_areas_employeeId_locality_key" ON "employee_service_areas"("employeeId", "locality");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_role_isRead_idx" ON "notifications"("role", "isRead");
