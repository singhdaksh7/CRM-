-- Phase A / A3 - multi-tenant organization branding.
--
-- No schema change: Organization already carries name/phone/logoUrl
-- (nullable). The public catalogue DTO and the public property page
-- (/p/[id]) previously showed hardcoded literals ("Delhi Broker CRM",
-- "+919811100001", "KP Properties", "+919811100002") for EVERY tenant
-- regardless of who owned the property/catalogue. Application code now
-- derives brand name/phone/logo from Property/CatalogueShare.organization.
--
-- This migration ONLY backfills the pre-existing "org_default" tenant's
-- phone number, and ONLY if it is currently unset, so that tenant's public
-- pages keep showing the exact number they showed before this change
-- (matching the catalogue-dto.ts hardcode, the more heavily-used of the two
-- surfaces). It never overwrites a phone number an operator has already
-- set, and it does nothing to any other organization row - a brand-new
-- tenant with phone = NULL will correctly show no call/WhatsApp button
-- until an admin sets their own number, rather than inheriting someone
-- else's.
UPDATE "organizations"
SET "phone" = '+919811100001'
WHERE "id" = 'org_default'
  AND "phone" IS NULL;
