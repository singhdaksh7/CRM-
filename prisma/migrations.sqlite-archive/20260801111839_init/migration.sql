-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    CONSTRAINT "properties_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "lastContactedAt" DATETIME,
    "nextFollowUpAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "leads_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "lead_transfers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lead_transfers_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "lead_transfers_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "lead_transfers_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "shared_property_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "propertyIds" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sharedById" TEXT,
    "whatsappLink" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "propertyId" TEXT,
    CONSTRAINT "shared_property_logs_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shared_property_logs_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "shared_property_logs_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    CONSTRAINT "visits_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "visits_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "visits_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "follow_ups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "ownerId" TEXT,
    "type" TEXT NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "follow_ups_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "follow_ups_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "activities_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "properties_propertyCode_key" ON "properties"("propertyCode");

-- CreateIndex
CREATE UNIQUE INDEX "leads_leadCode_key" ON "leads"("leadCode");

-- CreateIndex
CREATE UNIQUE INDEX "leads_externalLeadId_key" ON "leads"("externalLeadId");
