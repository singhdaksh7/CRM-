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
--    used for Lead.phone duplicates in POST /api/leads.
--
--    "At most one PRIMARY row per lead" (Blocker 3, correctness issue C
--    follow-up): src/lib/lead-phones.ts bundles the demote-old-PRIMARY +
--    create-new-PRIMARY into a single $transaction, but under PostgreSQL's
--    default READ COMMITTED isolation that transaction alone does NOT
--    prevent two concurrent "add new PRIMARY" requests from both
--    succeeding - the second request's UPDATE ... WHERE type='PRIMARY' can
--    legitimately match zero rows (the first transaction already demoted
--    the only PRIMARY row and committed) while its own INSERT still goes
--    through, leaving two PRIMARY rows. The lead_phones_one_primary_per_lead
--    partial unique index below is the actual backstop: Postgres enforces
--    it at the index level regardless of transaction isolation, so the
--    losing concurrent request gets a clean P2002 (converted to a 409 in
--    addLeadPhone) instead of silently producing a second PRIMARY row.
--    Prisma's schema DSL cannot express a partial (WHERE-qualified) unique
--    index in this Prisma version, so the invariant is declared here in raw
--    SQL only - see the comment on the LeadPhone model in schema.prisma,
--    which documents this and points back to this migration rather than
--    pretending the Prisma schema alone expresses the full invariant.
--
--    Pre-flight check (run before applying this migration in any
--    environment that might already have lead_phones rows - see runbook
--    note below for why that's not expected to matter here):
--      SELECT "organizationId", "leadId", count(*) FROM lead_phones
--        WHERE type = 'PRIMARY' GROUP BY 1, 2 HAVING count(*) > 1;
--    Expected result: 0 rows. lead_phones is a brand-new table created by
--    this same migration, and this migration has not been applied to any
--    database (dev, staging, or production) as of this branch - so there is
--    no possible pre-existing data and the partial unique index can be
--    created directly, with no cleanup step required first. If this
--    migration is ever split or reordered such that lead_phones rows could
--    already exist before this index is added, re-run the query above and
--    resolve any duplicates before applying.
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
-- (A visit_feedback.rating column briefly lived in this migration - removed
-- before ever being applied anywhere, after a later review found it
-- duplicated two already-shipped 1-5 rating concepts on the same visit,
-- VisitProperty.reactionRating and Visit.overallRating. See the comment on
-- the VisitFeedback model in schema.prisma for the full reasoning.)

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

-- CreateIndex (Blocker 3, correctness issue C follow-up - hand-written, not
-- Prisma-schema-generated: Prisma's schema DSL cannot express a partial
-- WHERE-qualified unique index in this Prisma version, so this is the sole
-- source of the "at most one PRIMARY LeadPhone per lead" invariant. See the
-- long comment above and the LeadPhone model doc comment in schema.prisma.)
-- Conceptually: UNIQUE (organizationId, leadId) WHERE type = 'PRIMARY'.
CREATE UNIQUE INDEX "lead_phones_one_primary_per_lead" ON "lead_phones"("organizationId", "leadId") WHERE "type" = 'PRIMARY';

-- AddForeignKey
ALTER TABLE "lead_phones" ADD CONSTRAINT "lead_phones_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_phones" ADD CONSTRAINT "lead_phones_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_phones" ADD CONSTRAINT "lead_phones_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
