-- Smart CRM V2 Phase 1 - Smart Notifications
--
-- Additive only: adds 6 new values to the existing NotificationType enum.
-- No existing rows, columns, or types are touched. Safe to run at any time,
-- with no downtime and no lock contention on existing tables - Postgres
-- ALTER TYPE ... ADD VALUE only appends to the enum's internal catalog.
--
-- This project's prisma/migrations/ has no version history (schema has been
-- kept in sync some other way, not via `prisma migrate`), so this file is a
-- plain SQL script rather than a generated Prisma migration folder. Run it
-- directly against the Supabase database (SQL editor, or `psql "$DIRECT_URL"
-- -f prisma/manual-migrations/2026-08-05-add-smart-notification-types.sql`)
-- BEFORE deploying the code that references these values - the sweep will
-- otherwise fail to create notifications of these types until this has run.
--
-- Must run outside of an explicit transaction block: Postgres does not allow
-- ALTER TYPE ... ADD VALUE inside a multi-statement transaction that also
-- uses the new value in the same transaction, but running these six
-- statements back to back (each auto-committed) is safe.

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'HOT_LEAD_NO_FOLLOWUP';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CATALOGUE_NO_RESPONSE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'VISIT_MISSED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PROPERTY_MISSING_PHOTOS';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DEAL_NEGOTIATION_STALE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DOCUMENT_EXPIRING';
