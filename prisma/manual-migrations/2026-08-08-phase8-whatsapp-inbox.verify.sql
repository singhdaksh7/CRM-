-- Read-only Phase 8 verification: returns zero rows when anything is missing or incompatible.
WITH required_activity(value) AS (VALUES ('WHATSAPP_INBOUND'), ('WHATSAPP_OUTBOUND'), ('WHATSAPP_CATALOGUE_SENT'), ('WHATSAPP_PROPERTY_SENT'), ('WHATSAPP_CONVERSATION_LINKED'))
SELECT 'activity_enum' AS check_name, COUNT(*) = 5 AS pass
FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN required_activity r ON r.value=e.enumlabel WHERE t.typname='ActivityType'
UNION ALL
SELECT 'message_enum', EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='WhatsAppMessageType' AND e.enumlabel='INTERACTIVE')
UNION ALL
SELECT 'contact_state_enum', COUNT(*) = 3 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='WhatsAppContactState' AND e.enumlabel IN ('LINKED','UNKNOWN','AMBIGUOUS')
UNION ALL
SELECT 'conversation_columns', COUNT(*) = 8 FROM information_schema.columns WHERE table_schema='public' AND table_name='whatsapp_conversations' AND column_name IN ('assignedToId','displayName','contactState','providerPhoneNumberId','providerMetadata','unreadCount','crmReadAt','leadId')
UNION ALL
SELECT 'message_columns', COUNT(*) = 8 FROM information_schema.columns WHERE table_schema='public' AND table_name='whatsapp_messages' AND column_name IN ('idempotencyKey','mediaObjectKey','mediaMimeType','mediaFilename','mediaSizeBytes','caption','providerErrorCode','providerTimestamp')
UNION ALL
SELECT 'indexes', COUNT(*) = 4 FROM pg_indexes WHERE schemaname='public' AND indexname IN ('whatsapp_messages_idempotencyKey_key','whatsapp_conversations_organizationId_phoneNumber_idx','whatsapp_conversations_organizationId_assignedToId_lastMessageAt_idx','whatsapp_conversations_organizationId_unreadCount_lastMessageAt_idx')
UNION ALL
SELECT 'foreign_keys', COUNT(*) = 2 FROM pg_constraint WHERE conname IN ('whatsapp_conversations_leadId_fkey','whatsapp_conversations_assignedToId_fkey') AND confdeltype='n' AND confupdtype='c';
