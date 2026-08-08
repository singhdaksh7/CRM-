-- Additive/idempotent Phase 8 production migration. Run manually in Supabase SQL Editor only after approval.
DO $$ BEGIN CREATE TYPE "WhatsAppContactState" AS ENUM ('LINKED', 'UNKNOWN', 'AMBIGUOUS'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'WHATSAPP_INBOUND';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'WHATSAPP_OUTBOUND';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'WHATSAPP_CATALOGUE_SENT';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'WHATSAPP_PROPERTY_SENT';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'WHATSAPP_CONVERSATION_LINKED';
ALTER TYPE "WhatsAppMessageType" ADD VALUE IF NOT EXISTS 'INTERACTIVE';

ALTER TABLE "whatsapp_conversations" ALTER COLUMN "leadId" DROP NOT NULL;
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "assignedToId" TEXT;
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "contactState" "WhatsAppContactState" NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "providerPhoneNumberId" TEXT;
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "providerMetadata" TEXT;
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "unreadCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "crmReadAt" TIMESTAMP(3);
UPDATE "whatsapp_conversations" SET "contactState" = 'LINKED' WHERE "leadId" IS NOT NULL AND "contactState" <> 'LINKED';

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_conversations_leadId_fkey') THEN ALTER TABLE "whatsapp_conversations" DROP CONSTRAINT "whatsapp_conversations_leadId_fkey"; END IF;
  ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
END $$;
DO $$ BEGIN ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "mediaObjectKey" TEXT;
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "mediaMimeType" TEXT;
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "mediaFilename" TEXT;
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "mediaSizeBytes" INTEGER;
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "caption" TEXT;
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "providerErrorCode" TEXT;
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "providerTimestamp" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_messages_idempotencyKey_key" ON "whatsapp_messages"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "whatsapp_conversations_organizationId_phoneNumber_idx" ON "whatsapp_conversations"("organizationId", "phoneNumber");
CREATE INDEX IF NOT EXISTS "whatsapp_conversations_organizationId_assignedToId_lastMessageAt_idx" ON "whatsapp_conversations"("organizationId", "assignedToId", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "whatsapp_conversations_organizationId_unreadCount_lastMessageAt_idx" ON "whatsapp_conversations"("organizationId", "unreadCount", "lastMessageAt");
