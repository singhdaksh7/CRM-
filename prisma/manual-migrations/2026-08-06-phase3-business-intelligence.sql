-- Phase 3 - Business Intelligence & Management Platform
--
-- Read-only introspection performed against the connected database
-- (information_schema.columns, information_schema.tables, pg_type,
-- pg_indexes, pg_constraint, _prisma_migrations) confirmed, as of
-- 2026-08-06:
--   - Tables "system_configs" and "automation_rules" do NOT exist.
--   - Enum types "LostDealReasonCategory", "AutomationTrigger",
--     "AutomationActionType" do NOT exist.
--   - Column "deals"."lostReasonCategory" does NOT exist.
--   - "deals" has 10 existing rows - the ADD COLUMN below must be
--     nullable with no backfill requirement, which it is.
--   - "organizations" and "users" both use TEXT primary keys and a TEXT
--     "organizationId" column defaulting to 'org_default'::text (see
--     saved_views for an existing org-scoped table using this exact
--     pattern, mirrored below for system_configs/automation_rules).
--   - _prisma_migrations only has 5 rows (init_postgres, storage_key,
--     firebase_storage_phase1, whatsapp_notification_types,
--     maps_localities_visit_routing) - 20260805160000_property_matching_workflow
--     has NO ledger row, yet catalogue_share_properties already has all 4
--     columns that migration would add (internalNote, isTopPick,
--     addedManually, addedByUserId). This means that migration's DDL was
--     already applied by some other means (e.g. `prisma db push` or a
--     manual run) without its ledger entry ever being written - a
--     pre-existing gap unrelated to Phase 3, not something this file
--     needs to fix. Recommend `prisma migrate resolve --applied
--     20260805160000_property_matching_workflow` separately to reconcile
--     the ledger without re-running DDL.
--
-- This file is additive-only and idempotent: every CREATE TYPE, CREATE
-- TABLE, ADD COLUMN, and ADD CONSTRAINT is guarded so re-running this
-- script on a database where some or all of it already exists is a
-- no-op, never an error. No existing table, column, row, or type is
-- altered or dropped. Organization scoping matches every other
-- org-scoped table in this schema (organizationId TEXT NOT NULL DEFAULT
-- 'org_default', FK -> organizations(id)).
--
-- Run against DIRECT_URL (port 5432, no pgbouncer) - DDL should not run
-- through the transaction-mode pooler:
--   psql "$DIRECT_URL" -f prisma/manual-migrations/2026-08-06-phase3-business-intelligence.sql
--
-- Companion file: 2026-08-06-phase3-business-intelligence.verify.sql
-- (read-only, run after applying this file).
--
-- DO NOT RUN THIS AGAINST PRODUCTION YET - staging review only per the
-- Phase 3 acceptance instructions. Kept unapplied pending sign-off.

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LostDealReasonCategory') THEN
    CREATE TYPE "LostDealReasonCategory" AS ENUM (
      'PRICE', 'LOCATION', 'COMPETITION', 'BUDGET', 'LOAN_REJECTED', 'OWNER_ISSUE', 'CLIENT_NOT_INTERESTED', 'OTHER'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AutomationTrigger') THEN
    CREATE TYPE "AutomationTrigger" AS ENUM (
      'LEAD_CREATED', 'VISIT_COMPLETED', 'CATALOGUE_OPENED', 'PAYMENT_RECEIVED'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AutomationActionType') THEN
    CREATE TYPE "AutomationActionType" AS ENUM (
      'ASSIGN_EMPLOYEE', 'CREATE_FOLLOW_UP', 'NOTIFY_EMPLOYEE', 'MARK_DEAL_CLOSED'
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- deals.lostReasonCategory - nullable, no default, no backfill needed
-- (10 existing rows all get NULL, matching "no lost-reason-category
-- recorded yet" - exactly how the Lost Deal Analysis report already
-- treats them, see LostDealAnalyticsData.uncategorizedCount).
-- ---------------------------------------------------------------------

ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "lostReasonCategory" "LostDealReasonCategory";

-- ---------------------------------------------------------------------
-- system_configs - singleton-per-organization row (UNIQUE organizationId).
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "system_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "values" TEXT NOT NULL DEFAULT '{}',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'system_configs_organizationId_key') THEN
    CREATE UNIQUE INDEX "system_configs_organizationId_key" ON "system_configs"("organizationId");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'system_configs_organizationId_fkey') THEN
    ALTER TABLE "system_configs" ADD CONSTRAINT "system_configs_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'system_configs_updatedById_fkey') THEN
    ALTER TABLE "system_configs" ADD CONSTRAINT "system_configs_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- automation_rules - many rows per organization, indexed by the
-- (organizationId, trigger, isActive) lookup runAutomationRules() does
-- on every LEAD_CREATED / VISIT_COMPLETED / CATALOGUE_OPENED /
-- PAYMENT_RECEIVED event.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "automation_rules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "name" TEXT NOT NULL,
    "trigger" "AutomationTrigger" NOT NULL,
    "actionType" "AutomationActionType" NOT NULL,
    "actionConfig" TEXT NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'automation_rules_organizationId_trigger_isActive_idx') THEN
    CREATE INDEX "automation_rules_organizationId_trigger_isActive_idx" ON "automation_rules"("organizationId", "trigger", "isActive");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'automation_rules_organizationId_fkey') THEN
    ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'automation_rules_createdById_fkey') THEN
    ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
