-- Read-only production pre-migration baseline for the Employee Authentication
-- & Account Lifecycle release. Takes no locks, performs no writes.
--
-- Purpose: capture the current state of `users` and `account_setup_tokens`
-- BEFORE the manual migration (2026-08-17-employee-auth-lifecycle.sql) runs,
-- so it can be diffed against the same queries run again afterward to prove
-- the migration changed nothing except adding the new columns/table.
--
-- Run this in the Supabase SQL Editor and save the single output row.

WITH counts AS (
  SELECT
    count(*) AS total_users,
    count(*) FILTER (WHERE status = 'ACTIVE')        AS active_count,
    count(*) FILTER (WHERE status = 'INACTIVE')      AS inactive_count,
    count(*) FILTER (WHERE status = 'PENDING_SETUP') AS pending_setup_count
  FROM "users"
), setup_tokens AS (
  SELECT count(*) AS account_setup_token_count
  FROM "account_setup_tokens"
), schema_presence AS (
  SELECT
    to_regclass('public.password_reset_tokens') IS NOT NULL AS password_reset_tokens_table_exists,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'authVersion'
    ) AS auth_version_column_exists,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'lastLoginAt'
    ) AS last_login_at_column_exists
), fingerprints AS (
  -- Aggregate MD5 checksums only - no plaintext or individual hash values are
  -- ever returned. Re-running this after the migration and comparing these
  -- three strings proves roles/statuses/password hashes/setup-token data are
  -- byte-for-byte unchanged by the migration.
  SELECT
    (SELECT md5(string_agg(id || ':' || role || ':' || status || ':' || "organizationId", ',' ORDER BY id)) FROM "users") AS roles_statuses_fingerprint,
    (SELECT md5(string_agg(id || ':' || "passwordHash", ',' ORDER BY id)) FROM "users") AS password_hash_fingerprint,
    (SELECT md5(string_agg(id || ':' || "userId" || ':' || coalesce("usedAt"::text, 'null') || ':' || "expiresAt"::text, ',' ORDER BY id)) FROM "account_setup_tokens") AS setup_token_fingerprint
)
SELECT * FROM counts, setup_tokens, schema_presence, fingerprints;
