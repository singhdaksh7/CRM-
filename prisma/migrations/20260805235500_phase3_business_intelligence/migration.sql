-- Phase 3 - Business Intelligence & Management Platform
-- Written by hand (no live DB connection available in this environment to
-- run `prisma migrate dev`); mirrors what Prisma would generate for the
-- schema.prisma changes in this branch. Verify with `prisma migrate diff`
-- against a real database before deploying.

-- CreateEnum
CREATE TYPE "LostDealReasonCategory" AS ENUM ('PRICE', 'LOCATION', 'COMPETITION', 'BUDGET', 'LOAN_REJECTED', 'OWNER_ISSUE', 'CLIENT_NOT_INTERESTED', 'OTHER');

-- CreateEnum
CREATE TYPE "AutomationTrigger" AS ENUM ('LEAD_CREATED', 'VISIT_COMPLETED', 'CATALOGUE_OPENED', 'PAYMENT_RECEIVED');

-- CreateEnum
CREATE TYPE "AutomationActionType" AS ENUM ('ASSIGN_EMPLOYEE', 'CREATE_FOLLOW_UP', 'NOTIFY_EMPLOYEE', 'MARK_DEAL_CLOSED');

-- AlterTable
ALTER TABLE "deals" ADD COLUMN "lostReasonCategory" "LostDealReasonCategory";

-- CreateTable
CREATE TABLE "system_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "values" TEXT NOT NULL DEFAULT '{}',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_rules" (
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

-- CreateIndex
CREATE UNIQUE INDEX "system_configs_organizationId_key" ON "system_configs"("organizationId");

-- CreateIndex
CREATE INDEX "automation_rules_organizationId_trigger_isActive_idx" ON "automation_rules"("organizationId", "trigger", "isActive");

-- AddForeignKey
ALTER TABLE "system_configs" ADD CONSTRAINT "system_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_configs" ADD CONSTRAINT "system_configs_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
