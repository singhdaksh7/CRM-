-- Forward-only, additive: adds lost/not-interested reason capture to Lead.
-- Reuses the existing "LostDealReasonCategory" enum type (created in
-- 20260805235500_phase3_business_intelligence for Deal.lostReasonCategory) -
-- no new enum type is introduced. Both new columns are nullable and default
-- to NULL, so every existing row remains valid with no backfill required.
-- No data is altered, dropped, or renamed.
ALTER TABLE "leads" ADD COLUMN "lostReasonCategory" "LostDealReasonCategory";
ALTER TABLE "leads" ADD COLUMN "lostReasonDetail" TEXT;
