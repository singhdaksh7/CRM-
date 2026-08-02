-- CreateTable
CREATE TABLE "whatsapp_conversations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "leadId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "lastMessageAt" DATETIME,
    "lastInboundAt" DATETIME,
    "lastOutboundAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "whatsapp_conversations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "whatsapp_conversations_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "conversationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "messageType" TEXT NOT NULL DEFAULT 'TEXT',
    "provider" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "content" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "templateName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "errorMessage" TEXT,
    "metadata" TEXT,
    "sentByUserId" TEXT,
    "replyToMessageId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME,
    "deliveredAt" DATETIME,
    "readAt" DATETIME,
    "failedAt" DATETIME,
    CONSTRAINT "whatsapp_messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "whatsapp_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "whatsapp_messages_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "whatsapp_messages_replyToMessageId_fkey" FOREIGN KEY ("replyToMessageId") REFERENCES "whatsapp_messages" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "catalogue_shares" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "token" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "conversationId" TEXT,
    "createdByUserId" TEXT,
    "title" TEXT NOT NULL,
    "introMessage" TEXT,
    "includePrice" BOOLEAN NOT NULL DEFAULT true,
    "includeAddress" BOOLEAN NOT NULL DEFAULT false,
    "includeBrokerage" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" DATETIME,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "catalogue_shares_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "catalogue_shares_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "catalogue_shares_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversations" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "catalogue_shares_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "catalogue_share_properties" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "catalogueShareId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "customNote" TEXT,
    "priceVisible" BOOLEAN NOT NULL DEFAULT true,
    "addressVisible" BOOLEAN NOT NULL DEFAULT false,
    "brokerageVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "catalogue_share_properties_catalogueShareId_fkey" FOREIGN KEY ("catalogueShareId") REFERENCES "catalogue_shares" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "catalogue_share_properties_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "catalogue_interactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "catalogueShareId" TEXT NOT NULL,
    "propertyId" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "clientName" TEXT,
    "clientPhone" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "catalogue_interactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "catalogue_interactions_catalogueShareId_fkey" FOREIGN KEY ("catalogueShareId") REFERENCES "catalogue_shares" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "catalogue_interactions_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "integration_webhook_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "provider" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "processedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integration_webhook_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "whatsapp_conversations_organizationId_status_idx" ON "whatsapp_conversations"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversations_leadId_phoneNumber_key" ON "whatsapp_conversations"("leadId", "phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_providerMessageId_key" ON "whatsapp_messages"("providerMessageId");

-- CreateIndex
CREATE INDEX "whatsapp_messages_conversationId_createdAt_idx" ON "whatsapp_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "whatsapp_messages_organizationId_status_idx" ON "whatsapp_messages"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "catalogue_shares_token_key" ON "catalogue_shares"("token");

-- CreateIndex
CREATE INDEX "catalogue_shares_organizationId_leadId_idx" ON "catalogue_shares"("organizationId", "leadId");

-- CreateIndex
CREATE UNIQUE INDEX "catalogue_share_properties_catalogueShareId_propertyId_key" ON "catalogue_share_properties"("catalogueShareId", "propertyId");

-- CreateIndex
CREATE INDEX "catalogue_interactions_catalogueShareId_type_idx" ON "catalogue_interactions"("catalogueShareId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "integration_webhook_events_provider_externalEventId_key" ON "integration_webhook_events"("provider", "externalEventId");
