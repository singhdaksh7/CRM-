-- Read-only Phase 5+6 compatibility verification. Do not run migrations here.
SELECT typname FROM pg_type WHERE typname IN ('DealOfferSide','RequirementBroadcastStatus','MatchRecommendationStatus') ORDER BY typname;
SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('deal_offers','requirement_broadcasts','requirement_broadcast_recipients','match_recommendations') ORDER BY table_name;
SELECT column_name, udt_name, is_nullable FROM information_schema.columns WHERE table_name='deals' AND column_name IN ('expectedBrokerageAmount','kpSharePct','partnerSharePct','closingNotes') ORDER BY column_name;
SELECT indexname FROM pg_indexes WHERE tablename IN ('deal_offers','requirement_broadcasts','match_recommendations') ORDER BY indexname;
SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname IN ('DealOfferSide','RequirementBroadcastStatus','MatchRecommendationStatus') ORDER BY t.typname,e.enumsortorder;
