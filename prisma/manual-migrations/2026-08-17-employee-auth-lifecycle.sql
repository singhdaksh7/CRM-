-- Additive, idempotent Employee Authentication & Account Lifecycle migration.
--
-- Safe to run more than once and safe to run against a live database while
-- the previous application version is still serving traffic: every statement
-- is additive (new nullable column, new column with a default, new table),
-- nothing is dropped or rewritten in place, and no existing column changes
-- type or nullability.
--
-- Compatibility preflight:
--   * "users"."authVersion" is NOT NULL DEFAULT 1. On PostgreSQL 11+ adding a
--     column with a constant default is a metadata-only operation (no table
--     rewrite), so this is safe on a large users table. Existing rows read
--     back as 1, which matches the version the application stamps into
--     freshly issued JWTs - no session is invalidated by the migration itself.
--   * "users"."lastLoginAt" is nullable with no default; existing rows show
--     as "Never" in the UI until their next successful sign-in.
--   * Both new columns are ignored by the previous application version, so
--     this can be applied before the new code is deployed.
--   * "password_reset_tokens" has no dependants; it is only written by the
--     new code paths.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "authVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");
CREATE INDEX IF NOT EXISTS "password_reset_tokens_organizationId_userId_idx" ON "password_reset_tokens"("organizationId", "userId");
CREATE INDEX IF NOT EXISTS "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");

DO $$ BEGIN
  ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
