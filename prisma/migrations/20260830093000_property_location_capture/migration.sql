-- Phase A / A7 - Field Executive GPS capture.
--
-- Adds audit metadata for an explicit, human-triggered on-site location
-- capture. Reuses the EXISTING "properties"."latitude"/"longitude" columns
-- for the coordinate itself (no duplicate coordinate pair) - these three
-- new columns record WHO captured it, WHEN, and how accurate the device
-- reported itself to be, distinct from the pre-existing geocode
-- (maps-provider) and manual-entry (desk) location paths.
--
-- All three columns are nullable and additive; no backfill is required or
-- performed - existing properties simply have no capture record until a
-- field executive explicitly captures one.
ALTER TABLE "properties" ADD COLUMN     "locationAccuracy" DOUBLE PRECISION,
ADD COLUMN     "locationCapturedAt" TIMESTAMP(3),
ADD COLUMN     "locationCapturedById" TEXT;

ALTER TABLE "properties" ADD CONSTRAINT "properties_locationCapturedById_fkey" FOREIGN KEY ("locationCapturedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
