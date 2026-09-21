-- Idempotent manual migration for Property OPEN/STILT parking types.
-- Additive only. Safe to re-run. Does not touch Lead/Visit/FollowUp workflow
-- tables, money/budget fields, localities, or WhatsApp.
--
-- "parkingAvailable" is kept (not dropped/renamed) - it remains a stored
-- column that the application server-syncs to
-- (hasOpenParking OR hasStiltParking) on every manual create/edit (see
-- POST/PATCH /api/properties). Every existing reader (matching,
-- catalogue/public DTOs, imports) keeps working unchanged.
--
-- Backfill: rows that already had "parkingAvailable" = true predate this
-- distinction and never recorded which type. We default "hasOpenParking" to
-- true for those rows (open parking is the more common/default case in this
-- inventory) rather than leaving both flags false, so the fact that parking
-- was available is never silently lost. Staff can refine to open+stilt or
-- stilt-only later via the property edit form. Rows with
-- "parkingAvailable" = false are untouched.

ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "hasOpenParking" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "hasStiltParking" BOOLEAN NOT NULL DEFAULT false;

UPDATE "properties" SET "hasOpenParking" = true WHERE "parkingAvailable" = true AND "hasOpenParking" = false AND "hasStiltParking" = false;
