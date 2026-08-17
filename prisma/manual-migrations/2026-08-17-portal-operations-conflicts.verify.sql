SELECT table_name FROM information_schema.tables WHERE table_name = 'portal_operations';
SELECT column_name FROM information_schema.columns WHERE table_name = 'portal_listings' AND column_name IN ('conflictFields','conflictResolution','payloadVersion');
