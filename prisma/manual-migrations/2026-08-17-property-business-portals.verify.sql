-- Read-only compatibility verification.
SELECT column_name FROM information_schema.columns WHERE table_name IN ('properties','leads') AND column_name IN ('assetClass','transactionType','portalProvider');
SELECT typname FROM pg_type WHERE typname IN ('AssetClass','TransactionType','PropertyPortalProvider','CommercialFitOut','PortalCapabilityStatus','PortalConnectionStatus','PortalConnectionMode','PortalListingStatus','PortalIngestionStatus');
-- Every portal table this feature adds must exist before the demo seed or any listing workflow runs.
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('property_portal_connections','portal_listings','external_lead_events');
-- Provenance columns the review workflow depends on.
SELECT column_name FROM information_schema.columns WHERE table_name = 'external_lead_events' AND column_name IN ('provider','externalLeadId','externalEventId','receivedAt','rawPayloadHash','ingestionStatus','resolvedAt','resolvedById');
-- No connection may claim CONNECTED while every provider remains contract-only.
SELECT COUNT(*) AS connections_claiming_connected FROM "property_portal_connections" WHERE "status" = 'CONNECTED';
-- Commercial leads must never carry a residential BHK preference.
SELECT COUNT(*) AS commercial_leads_with_bhk FROM "leads" WHERE "assetClass" = 'COMMERCIAL' AND "preferredBhk" IS NOT NULL;
SELECT COUNT(*) AS commercial_without_bhk_requirement FROM "properties" WHERE "assetClass" = 'COMMERCIAL' AND "bhk" = 0;
