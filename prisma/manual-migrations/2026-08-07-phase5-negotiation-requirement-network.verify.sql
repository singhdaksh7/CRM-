-- Read-only Phase 5+6 compatibility verification. Every statement is SELECT-only.
SELECT t.typname, e.enumlabel, e.enumsortorder
FROM pg_type t
LEFT JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname IN ('DealOfferSide','RequirementBroadcastStatus','MatchRecommendationStatus')
ORDER BY t.typname, e.enumsortorder;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('deal_offers','requirement_broadcasts','requirement_broadcast_recipients','match_recommendations')
ORDER BY table_name;

SELECT table_name, ordinal_position, column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    table_name IN ('deal_offers','requirement_broadcasts','requirement_broadcast_recipients','match_recommendations')
    OR (table_name = 'deals' AND column_name IN ('expectedBrokerageAmount','kpSharePct','partnerSharePct','closingNotes'))
  )
ORDER BY table_name, ordinal_position;

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('deal_offers','requirement_broadcasts','requirement_broadcast_recipients','match_recommendations')
ORDER BY tablename, indexname;

SELECT c.conname, c.conrelid::regclass AS table_name, c.confrelid::regclass AS references_table,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.conname IN (
  'deal_offers_organizationId_fkey','deal_offers_dealId_fkey','deal_offers_createdById_fkey',
  'requirement_broadcasts_organizationId_fkey','requirement_broadcasts_leadId_fkey','requirement_broadcasts_createdById_fkey',
  'requirement_broadcast_recipients_requirementBroadcastId_fkey','requirement_broadcast_recipients_inventoryPartnerId_fkey',
  'match_recommendations_organizationId_fkey','match_recommendations_leadId_fkey',
  'match_recommendations_propertyId_fkey','match_recommendations_handledById_fkey'
)
ORDER BY c.conname;

SELECT table_name, column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('deal_offers','requirement_broadcasts','match_recommendations')
  AND column_name = 'organizationId'
ORDER BY table_name;
