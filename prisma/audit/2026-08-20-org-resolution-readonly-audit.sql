-- ============================================================================
-- READ-ONLY audit: current Organization <-> User state, ahead of enabling
-- real per-session organization resolution (see src/lib/organization.ts and
-- the "Replace the org_default stub" commit on branch
-- security/org-isolation-audit).
--
-- Every statement in this file is a SELECT. Nothing here writes, and it is
-- NOT applied to any database as part of this change - run it by hand
-- against a real environment when someone needs the numbers, and review the
-- output before deciding whether prisma/audit/2026-08-20-org-resolution-
-- backfill.sql (drafted separately) is actually needed there.
--
-- No secrets are selected anywhere below (no passwordHash, no token hashes,
-- no auth-version columns).
-- ============================================================================

-- 1. Every organization that exists today, and how many users/properties/
--    leads it owns. In a still-single-tenant deployment this should show
--    exactly one row (org_default) with all the data; more than one row, or
--    a second row with zero/near-zero data, is worth a human look before
--    relying on per-session resolution.
SELECT
  o.id                                                     AS organization_id,
  o.slug,
  o.name,
  o."createdAt"                                            AS organization_created_at,
  (SELECT count(*) FROM users u WHERE u."organizationId" = o.id)       AS user_count,
  (SELECT count(*) FROM properties p WHERE p."organizationId" = o.id)  AS property_count,
  (SELECT count(*) FROM leads l WHERE l."organizationId" = o.id)       AS lead_count
FROM organizations o
ORDER BY o."createdAt";

-- 2. Users grouped by organization, by role and status - the actual
--    population that will start resolving to their own org's data instead
--    of the stub the moment this ships. PENDING_SETUP/INACTIVE users are
--    included so an operator can see who hasn't completed onboarding.
SELECT
  u."organizationId",
  u.role,
  u.status,
  count(*) AS user_count
FROM users u
GROUP BY u."organizationId", u.role, u.status
ORDER BY u."organizationId", u.role, u.status;

-- 3. Users with NO organization association at all, or one pointing at an
--    organization row that doesn't exist. The organizationId column is
--    NOT NULL with a DEFAULT, so this should always return zero rows in a
--    healthy database - a non-empty result here means someone bypassed the
--    schema default (e.g. a manual UPDATE, or a direct INSERT that set an
--    empty string) and those accounts will now fail closed on login
--    (see isSessionStillValid in src/lib/session-guard.ts) until fixed.
SELECT u.id, u.email, u.role, u.status, u."organizationId"
FROM users u
LEFT JOIN organizations o ON o.id = u."organizationId"
WHERE u."organizationId" IS NULL
   OR u."organizationId" = ''
   OR o.id IS NULL;

-- 4. Employees (assignedToId on leads/visits, ownerId on follow-ups) whose
--    own organizationId does not match the organizationId of the
--    lead/visit/follow-up they're attached to. Should always be zero rows
--    given every create path derives both from the same session - a
--    non-zero result means some historical data was created out-of-band
--    (an import, a manual SQL fix, a bug in an earlier version) and is
--    worth reviewing before/after this change, since those rows will now
--    behave differently (e.g. an "unassigned to me" panel might newly
--    exclude or newly include them depending on which side the mismatch is
--    on).
SELECT 'lead_assignedTo_org_mismatch' AS check_name, l.id AS row_id, l."organizationId" AS row_org, u.id AS user_id, u."organizationId" AS user_org
FROM leads l
JOIN users u ON u.id = l."assignedToId"
WHERE l."organizationId" <> u."organizationId"
UNION ALL
SELECT 'visit_assignedTo_org_mismatch', v.id, v."organizationId", u.id, u."organizationId"
FROM visits v
JOIN users u ON u.id = v."assignedToId"
WHERE v."organizationId" <> u."organizationId"
UNION ALL
SELECT 'followup_owner_org_mismatch', f.id, f."organizationId", u.id, u."organizationId"
FROM follow_ups f
JOIN users u ON u.id = f."ownerId"
WHERE f."organizationId" <> u."organizationId";

-- 5. Sanity check on the tenant-owned tables that matter most for the
--    isolation fixes on this branch: row counts per organization for
--    Property, Lead, Deal, Visit, Document, Activity, Notification,
--    CustomerContact, CustomerRequirement. Lets a reviewer eyeball whether
--    a second organization (if one exists) actually has meaningful data
--    before/after cutover, rather than being an empty shell that would
--    make "it works" hard to tell apart from "there's nothing to leak".
SELECT 'properties' AS table_name, "organizationId", count(*) FROM properties GROUP BY "organizationId"
UNION ALL
SELECT 'leads', "organizationId", count(*) FROM leads GROUP BY "organizationId"
UNION ALL
SELECT 'deals', "organizationId", count(*) FROM deals GROUP BY "organizationId"
UNION ALL
SELECT 'visits', "organizationId", count(*) FROM visits GROUP BY "organizationId"
UNION ALL
SELECT 'documents', "organizationId", count(*) FROM documents GROUP BY "organizationId"
UNION ALL
SELECT 'activities', "organizationId", count(*) FROM activities GROUP BY "organizationId"
UNION ALL
SELECT 'notifications', "organizationId", count(*) FROM notifications GROUP BY "organizationId"
UNION ALL
SELECT 'customer_contacts', "organizationId", count(*) FROM customer_contacts GROUP BY "organizationId"
UNION ALL
SELECT 'customer_requirements', "organizationId", count(*) FROM customer_requirements GROUP BY "organizationId"
ORDER BY 1, 2;

-- 6. One-shot executive summary answering "do we actually have more than
--    one real tenant, and how much of everything is still on org_default":
--    total organization count, total user count, how many users sit on
--    the literal 'org_default' row vs. elsewhere, and how many DISTINCT
--    organizations actually have at least one user. Note on "duplicate/
--    ambiguous org relationships": not applicable to this schema by
--    construction - User.organizationId is a single NOT NULL foreign key
--    (one user belongs to exactly one organization, never several), so
--    there is no many-to-many membership table that could produce an
--    ambiguous/duplicate association in the first place; query 3 above is
--    the relevant integrity check for this schema shape (a dangling or
--    empty organizationId), not a duplicate-membership check.
SELECT
  (SELECT count(*) FROM organizations)                                   AS total_organizations,
  (SELECT count(*) FROM users)                                           AS total_users,
  (SELECT count(*) FROM users WHERE "organizationId" = 'org_default')    AS users_on_org_default,
  (SELECT count(*) FROM users WHERE "organizationId" <> 'org_default')   AS users_on_other_orgs,
  (SELECT count(DISTINCT "organizationId") FROM users)                  AS distinct_orgs_with_users;
