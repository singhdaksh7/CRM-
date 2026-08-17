-- Read-only compatibility verification.
SELECT column_name FROM information_schema.columns WHERE table_name IN ('properties','leads') AND column_name IN ('assetClass','transactionType','portalProvider');
SELECT typname FROM pg_type WHERE typname IN ('AssetClass','TransactionType','PropertyPortalProvider','CommercialFitOut');
SELECT COUNT(*) AS commercial_without_bhk_requirement FROM "properties" WHERE "assetClass" = 'COMMERCIAL' AND "bhk" = 0;
