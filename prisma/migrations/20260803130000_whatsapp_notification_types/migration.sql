-- AlterEnum
-- Additive only - adds three new NotificationType values used by the
-- WhatsApp Cloud API webhook hardening (unknown inbound contact, ambiguous
-- multi-lead phone match, template configuration issues). Does not remove,
-- rename, or reorder any existing value, and touches no table data.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WHATSAPP_UNKNOWN_CONTACT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WHATSAPP_MULTIPLE_LEAD_MATCH';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WHATSAPP_TEMPLATE_CONFIG_ISSUE';
