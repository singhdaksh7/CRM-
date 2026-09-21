-- Additive: OPEN and STILT parking as distinct, independently-selectable
-- Property fields. `parkingAvailable` is NOT dropped or renamed - it stays
-- as a stored, server-synced column (see POST/PATCH /api/properties) so
-- every existing reader (matching, catalogue/public DTOs, imports) keeps
-- working unchanged.
--
-- Backfill: existing rows with "parkingAvailable" = true predate this
-- distinction and never recorded which type. We default "hasOpenParking"
-- to true for those rows (open parking is the more common/default case in
-- this inventory) rather than leaving both flags false, so the fact that
-- parking was available is never silently lost. Staff can refine to
-- open+stilt or stilt-only later via the property edit form. Rows with
-- "parkingAvailable" = false are untouched (both new flags stay false, the
-- column default).
ALTER TABLE "properties" ADD COLUMN "hasOpenParking" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "properties" ADD COLUMN "hasStiltParking" BOOLEAN NOT NULL DEFAULT false;

UPDATE "properties" SET "hasOpenParking" = true WHERE "parkingAvailable" = true;
