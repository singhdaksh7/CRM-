import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * simplified-role-workflow (Blocker 3) - "at most one PRIMARY LeadPhone per
 * lead" cannot be expressed in the Prisma schema DSL in this Prisma version
 * (no partial/WHERE-qualified unique index support), so the actual DB-level
 * invariant lives only in the raw migration SQL. This is the "verifier":
 * a source-level check that the tracked, not-yet-applied migration file
 * actually contains the correct partial unique index, so a future edit to
 * that file can't silently drop the invariant without a test failing. It
 * cannot verify real Postgres enforcement (no live database in this test
 * suite - see lead-phones.test.ts for the P2002-classification contract
 * that this index's violations are turned into a clean 409 by), only that
 * the SQL contract is present and correctly shaped.
 */

const MIGRATION_PATH = join(__dirname, "..", "..", "prisma", "migrations", "20260822120000_simplified_role_workflow_additive", "migration.sql");

describe("lead_phones PRIMARY invariant - migration SQL contract", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf-8");

  it("creates a partial unique index scoped to organizationId + leadId, qualified to PRIMARY rows only", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "lead_phones_one_primary_per_lead" ON "lead_phones"\("organizationId", "leadId"\) WHERE "type" = 'PRIMARY';/
    );
  });

  it("does not use a bare (non-partial) unique index for this constraint, which would forbid multiple ALTERNATE rows per lead", () => {
    // A bare `CREATE UNIQUE INDEX ... ("organizationId", "leadId")` with no
    // WHERE clause would also block a second ALTERNATE number for the same
    // lead - the whole point of the partial qualifier.
    const bareIndexOnSameColumns = /CREATE UNIQUE INDEX "lead_phones_one_primary_per_lead" ON "lead_phones"\("organizationId", "leadId"\);/;
    expect(sql).not.toMatch(bareIndexOnSameColumns);
  });

  it("still keeps the general per-lead duplicate-number unique index (organizationId, leadId, phone) alongside the new partial index", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX "lead_phones_organizationId_leadId_phone_key" ON "lead_phones"\("organizationId", "leadId", "phone"\);/);
  });

  it("the lead_phones table itself is still created (additive migration, not a rewrite)", () => {
    expect(sql).toMatch(/CREATE TABLE "lead_phones" \(/);
  });

  it("documents the pre-flight zero-existing-duplicate-PRIMARY assumption for anyone applying this migration to a non-empty database", () => {
    expect(sql.toLowerCase()).toMatch(/pre-flight check/);
    expect(sql).toMatch(/HAVING count\(\*\) > 1/);
  });
});

describe("org_isolation_indexes migration - untouched (Blocker 3 must not modify it)", () => {
  it("is not the same file as the simplified-role-workflow migration and was not merged into it", () => {
    const orgIsolationPath = join(__dirname, "..", "..", "prisma", "migrations", "20260820090000_org_isolation_indexes", "migration.sql");
    const orgIsolationSql = readFileSync(orgIsolationPath, "utf-8");
    expect(orgIsolationSql).not.toMatch(/lead_phones/);
    expect(orgIsolationSql).not.toMatch(/one_primary_per_lead/);
  });
});
