-- feature/simplified-role-workflow (continuation pass). Fully additive - one
-- new enum value, no column/table changes, no data migration. Generated
-- offline via `prisma migrate diff` against the schema as of commit
-- 6ed30e23baf7da0c46886c5ec425fbf013c33818 (this branch's prior HEAD). NOT
-- applied to any database as part of this change.
--
-- Adds FollowUpStatus.CANCELLED - the terminal state behind the Add
-- Follow-up UX's [Cancel] action (spec item 4), distinct from COMPLETED (the
-- work was actually done). Every existing query that scopes "active" follow-
-- up work whitelists `status: { in: ["PENDING", "OVERDUE"] }` rather than
-- blacklisting COMPLETED (see src/lib/notifications.ts,
-- src/lib/dashboard-data.ts, src/lib/todays-work.ts, and the follow-ups list
-- page), so a CANCELLED row is automatically excluded from all of them with
-- no other call site needing to change.

-- AlterEnum
ALTER TYPE "FollowUpStatus" ADD VALUE 'CANCELLED';
