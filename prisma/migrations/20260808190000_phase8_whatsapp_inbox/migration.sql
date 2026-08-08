-- Phase 8: full employee-controlled WhatsApp CRM inbox.
ALTER TYPE "ActivityType" ADD VALUE 'WHATSAPP_INBOUND';
ALTER TYPE "ActivityType" ADD VALUE 'WHATSAPP_OUTBOUND';
ALTER TYPE "ActivityType" ADD VALUE 'WHATSAPP_CATALOGUE_SENT';
ALTER TYPE "ActivityType" ADD VALUE 'WHATSAPP_PROPERTY_SENT';
ALTER TYPE "ActivityType" ADD VALUE 'WHATSAPP_CONVERSATION_LINKED';
ALTER TYPE "WhatsAppMessageType" ADD VALUE 'INTERACTIVE';
CREATE TYPE "WhatsAppContactState" AS ENUM ('LINKED', 'UNKNOWN', 'AMBIGUOUS');

ALTER TABLE "whatsapp_conversations"
  ALTER COLUMN "leadId" DROP NOT NULL,
  ADD COLUMN "assignedToId" TEXT,
  ADD COLUMN "displayName" TEXT,
  ADD COLUMN "contactState" "WhatsAppContactState" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "providerPhoneNumberId" TEXT,
  ADD COLUMN "providerMetadata" TEXT,
  ADD COLUMN "unreadCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "crmReadAt" TIMESTAMP(3);

UPDATE "whatsapp_conversations" SET "contactState" = 'LINKED' WHERE "leadId" IS NOT NULL;
ALTER TABLE "whatsapp_conversations" DROP CONSTRAINT "whatsapp_conversations_leadId_fkey";
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "whatsapp_messages"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "mediaObjectKey" TEXT,
  ADD COLUMN "mediaMimeType" TEXT,
  ADD COLUMN "mediaFilename" TEXT,
  ADD COLUMN "mediaSizeBytes" INTEGER,
  ADD COLUMN "caption" TEXT,
  ADD COLUMN "providerErrorCode" TEXT,
  ADD COLUMN "providerTimestamp" TIMESTAMP(3);

CREATE UNIQUE INDEX "whatsapp_messages_idempotencyKey_key" ON "whatsapp_messages"("idempotencyKey");
CREATE INDEX "whatsapp_conversations_organizationId_phoneNumber_idx" ON "whatsapp_conversations"("organizationId", "phoneNumber");
CREATE INDEX "whatsapp_conversations_organizationId_assignedToId_lastMessageAt_idx" ON "whatsapp_conversations"("organizationId", "assignedToId", "lastMessageAt");
CREATE INDEX "whatsapp_conversations_organizationId_unreadCount_lastMessageAt_idx" ON "whatsapp_conversations"("organizationId", "unreadCount", "lastMessageAt");
