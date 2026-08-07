-- Additive, idempotent employee account activation migration.
ALTER TYPE "EmployeeStatus" ADD VALUE IF NOT EXISTS 'PENDING_SETUP';

CREATE TABLE IF NOT EXISTS "account_setup_tokens" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "account_setup_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "account_setup_tokens_tokenHash_key" ON "account_setup_tokens"("tokenHash");
CREATE INDEX IF NOT EXISTS "account_setup_tokens_organizationId_userId_idx" ON "account_setup_tokens"("organizationId", "userId");
CREATE INDEX IF NOT EXISTS "account_setup_tokens_expiresAt_idx" ON "account_setup_tokens"("expiresAt");

DO $$ BEGIN
  ALTER TABLE "account_setup_tokens" ADD CONSTRAINT "account_setup_tokens_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "account_setup_tokens" ADD CONSTRAINT "account_setup_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
