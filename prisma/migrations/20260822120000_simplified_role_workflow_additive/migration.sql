-- feature/simplified-role-workflow. Fully additive - no column drops, no
-- type changes, no data migration, no existing row touched. Generated
-- offline via:
--   prisma migrate diff --from-schema-datamodel <schema as of
--     ad73d9641f8596a31a87866c9d3cd469d2144f65> \
--     --to-schema-datamodel prisma/schema.prisma --script
-- NOT applied to any database (dev, staging, or production) as part of this
-- change - see AGENTS.md/CLAUDE.md hard stops. For human review, then to be
-- applied via the normal `prisma migrate deploy` production path when
-- someone signs off.
--
-- What this adds, and why:
--
-- 1. lead_phones (new table) - multiple phone numbers per Lead (spec item
--    5). Lead.phone is untouched and stays the primary/legacy number so
--    every existing query, index, and integration keeps working exactly as
--    before; this table is pure additive capability. One row per number,
--    normalized the same way as Lead.phone (normalizeIndianPhone(), see
--    src/integrations/whatsapp.ts), org-scoped, FK'd to both Organization
--    and Lead (cascade-deleted with the lead), optional FK to the User who
--    added it. Unique on (organizationId, leadId, phone) so the same number
--    cannot be added twice to one lead - this is a per-lead dedupe guard
--    only, NOT a cross-lead merge: the same phone number may legitimately
--    exist on more than one Lead row (e.g. a family member enquiring
--    separately), matching the existing warn-don't-merge behavior already
--    used for Lead.phone duplicates in POST /api/leads. "At most one PRIMARY
--    row per lead" is enforced in application code
--    (src/lib/lead-phones.ts), not a DB constraint - Postgres has no
--    portable "at most one row where type='PRIMARY'" constraint without a
--    partial unique index; adding one is a suggested follow-up, not done
--    here to keep this migration a straight schema-diff output.
--
-- 2. FollowUpType enum: adds VISIT_EXPECTED and GENERAL_FOLLOW_UP. The
--    simple "Add Follow-up" form (spec item 6) offers CALL / WHATSAPP /
--    VISIT_EXPECTED / GENERAL_FOLLOW_UP; CALL and WHATSAPP already map onto
--    the existing PHONE_CALL and WHATSAPP values (reused, not duplicated -
--    see the UI-layer mapping in src/lib/follow-up-types.ts). Only the two
--    values with no existing equivalent are added. Postgres cannot add
--    multiple enum values in the same transaction as other DDL in older
--    versions - each ALTER TYPE ... ADD VALUE below is its own statement,
--    matching what `prisma migrate diff` itself generates.
--
-- 3. visit_feedback.rating (nullable Int) - the one confirmed schema gap
--    from the audit: a numeric 1-5 customer rating captured by the field
--    executive after a visit (spec item 11). Nullable so every existing row
--    stays valid; the 1-5 range is enforced in application code
--    (src/lib/validators.ts) rather than a CHECK constraint, consistent with
--    how every other bounded Int field in this schema is handled.

-- CreateEnum
CREATE TYPE "LeadPhoneType" AS ENUM ('PRIMARY', 'ALTERNATE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FollowUpType" ADD VALUE 'VISIT_EXPECTED';
ALTER TYPE "FollowUpType" ADD VALUE 'GENERAL_FOLLOW_UP';

-- AlterTable
ALTER TABLE "visit_feedback" ADD COLUMN     "rating" INTEGER;

-- CreateTable
CREATE TABLE "lead_phones" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_default',
    "leadId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "type" "LeadPhoneType" NOT NULL DEFAULT 'ALTERNATE',
    "label" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_phones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_phones_organizationId_leadId_idx" ON "lead_phones"("organizationId", "leadId");

-- CreateIndex
CREATE INDEX "lead_phones_organizationId_phone_idx" ON "lead_phones"("organizationId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "lead_phones_organizationId_leadId_phone_key" ON "lead_phones"("organizationId", "leadId", "phone");

-- AddForeignKey
ALTER TABLE "lead_phones" ADD CONSTRAINT "lead_phones_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_phones" ADD CONSTRAINT "lead_phones_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_phones" ADD CONSTRAINT "lead_phones_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
