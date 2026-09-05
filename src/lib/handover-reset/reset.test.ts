import { describe, it, expect } from "vitest";
import { FakeResetDb, type FakeRow } from "./test-support/fake-reset-db";
import { computeDryRunReport, executeReset, HandoverResetAbortedError, type ResetClient } from "./reset";
import { HANDOVER_ADMIN_EMAIL, HANDOVER_ORGANIZATION_ID, REQUIRED_EXECUTE_CONFIRMATION } from "./constants";
import { DELETION_PLAN } from "./deletion-plan";

const ORG = HANDOVER_ORGANIZATION_ID;

function healthySeed(): Record<string, FakeRow[]> {
  return {
    organization: [{ id: ORG, name: "Delhi Broker CRM" }],
    systemConfig: [{ id: "sysconf-1", organizationId: ORG, values: "{}" }],
    user: [
      { id: "admin-1", email: HANDOVER_ADMIN_EMAIL, name: "Founder", role: "ADMIN", status: "ACTIVE", organizationId: ORG },
      { id: "emp-1", email: "demo.emp1@kpproperties.demo", name: "Demo Emp", role: "DATA_MANAGER", status: "ACTIVE", organizationId: ORG },
      { id: "emp-2", email: "demo.emp2@kpproperties.demo", name: "Demo Emp 2", role: "FIELD_EXECUTIVE", status: "ACTIVE", organizationId: ORG },
    ],
    propertyPortalConnection: [
      { id: "conn-1", organizationId: ORG, provider: "HOUSING", status: "CONNECTED", connectionMode: "WEBHOOK", displayName: "Housing prod", credentialReference: "secretref-1" },
    ],
    lead: [
      { id: "lead-1", organizationId: ORG },
      { id: "lead-2", organizationId: ORG },
    ],
    property: [{ id: "prop-1", organizationId: ORG }],
    propertyImage: [{ id: "img-1", organizationId: ORG, propertyId: "prop-1", storageKey: "organizations/org_default/properties/prop-1/images/abc.webp", thumbnailKey: null }],
    document: [{ id: "doc-1", organizationId: ORG, storageKey: "organizations/org_default/leads/lead-1/documents/xyz.pdf" }],
    importJob: [{ id: "job-1", organizationId: ORG, entityType: "HOUSING_LEADS" }],
    importRecord: [{ id: "rec-1", importJobId: "job-1" }],
  };
}

/**
 * A few models' deletion filters resolve through a parent relation rather
 * than a plain organizationId column (see deletion-plan.ts's relation-filter
 * steps) - their fake rows need the matching FK field pointing at an
 * existing, org-scoped parent row, or the fake DB's relation lookup can
 * never match them.
 */
const RELATION_SEED_FK: Record<string, { fk: string; parentId: string }> = {
  catalogueShareProperty: { fk: "catalogueShareId", parentId: "catalogueShare-1" },
  requirementBroadcastRecipient: { fk: "requirementBroadcastId", parentId: "requirementBroadcast-1" },
  importRecord: { fk: "importJobId", parentId: "job-1" },
  propertyFavorite: { fk: "propertyId", parentId: "prop-1" },
  propertyViewLog: { fk: "propertyId", parentId: "prop-1" },
};

/** Seeds every remaining model in DELETION_PLAN with one org-scoped row, so "every table gets deleted" tests have something to check. */
function withEveryModelPopulated(): Record<string, FakeRow[]> {
  const seed = healthySeed();
  for (const step of DELETION_PLAN) {
    if (seed[step.model]) continue;
    const rel = RELATION_SEED_FK[step.model];
    seed[step.model] = [{ id: `${step.model}-1`, organizationId: ORG, ...(rel ? { [rel.fk]: rel.parentId } : {}) }];
  }
  return seed;
}

function makeDb(overrides: Partial<Record<string, FakeRow[]>> = {}, options?: ConstructorParameters<typeof FakeResetDb>[1]) {
  const merged: Record<string, FakeRow[]> = { ...withEveryModelPopulated(), ...overrides } as Record<string, FakeRow[]>;
  return new FakeResetDb(merged, options);
}

describe("computeDryRunReport - zero mutations", () => {
  it("never deletes anything, even when preflight passes cleanly", async () => {
    const db = makeDb();
    const before = db.rowCount("lead");
    await computeDryRunReport(db.client as unknown as ResetClient);
    expect(db.rowCount("lead")).toBe(before);
    expect(db.hasRow("user", "admin-1")).toBe(true);
    expect(db.hasRow("user", "emp-1")).toBe(true);
  });

  it("reports the handover admin as preserved and other users as to-delete", async () => {
    const db = makeDb();
    const report = await computeDryRunReport(db.client as unknown as ResetClient);
    expect(report.usersToPreserve.map((u) => u.email)).toEqual([HANDOVER_ADMIN_EMAIL]);
    expect(report.usersToDelete.map((u) => u.email).sort()).toEqual(["demo.emp1@kpproperties.demo", "demo.emp2@kpproperties.demo"]);
  });

  it("reports PropertyPortalConnection rows without ever touching them, and never leaks the credential reference itself", async () => {
    const db = makeDb();
    const report = await computeDryRunReport(db.client as unknown as ResetClient);
    expect(report.preflight.portalConnections).toHaveLength(1);
    expect(report.preflight.portalConnections[0].hasCredentialReference).toBe(true);
    expect(JSON.stringify(report.preflight.portalConnections)).not.toContain("secretref-1");
  });

  it("discovers property image and document object keys owned by rows in scope", async () => {
    const db = makeDb();
    const report = await computeDryRunReport(db.client as unknown as ResetClient);
    expect(report.objectKeysDiscovered).toContain("organizations/org_default/properties/prop-1/images/abc.webp");
    expect(report.objectKeysDiscovered).toContain("organizations/org_default/leads/lead-1/documents/xyz.pdf");
  });

  it("includes Housing.com import jobs/records in the deletion counts", async () => {
    const db = makeDb();
    const report = await computeDryRunReport(db.client as unknown as ResetClient);
    expect(report.deletionCounts.importJob).toBe(1);
    expect(report.deletionCounts.importRecord).toBe(1);
  });
});

describe("executeReset - confirmation gate", () => {
  it("performs zero mutations when --execute is called with no confirm at all", async () => {
    const db = makeDb();
    await expect(executeReset(db.client as unknown as ResetClient, { confirm: undefined })).rejects.toThrow(HandoverResetAbortedError);
    expect(db.rowCount("lead")).toBe(2);
    expect(db.hasRow("user", "emp-1")).toBe(true);
  });

  it("performs zero mutations when confirm is the wrong string (typo)", async () => {
    const db = makeDb();
    await expect(executeReset(db.client as unknown as ResetClient, { confirm: "reset_kp_demo_data" })).rejects.toThrow(HandoverResetAbortedError);
    expect(db.rowCount("lead")).toBe(2);
  });

  it("performs zero mutations when confirm is a plausible-but-wrong value", async () => {
    const db = makeDb();
    await expect(executeReset(db.client as unknown as ResetClient, { confirm: "RESET_DEMO_DATA" })).rejects.toThrow(HandoverResetAbortedError);
    expect(db.rowCount("lead")).toBe(2);
  });
});

describe("executeReset - fail-closed preflight aborts with zero writes", () => {
  it("aborts when org_default is missing", async () => {
    const db = makeDb({ organization: [] });
    await expect(executeReset(db.client as unknown as ResetClient, { confirm: REQUIRED_EXECUTE_CONFIRMATION })).rejects.toThrow(HandoverResetAbortedError);
    expect(db.rowCount("lead")).toBe(2);
  });

  it("aborts when the handover admin is missing entirely", async () => {
    const db = makeDb({ user: [{ id: "emp-1", email: "demo.emp1@kpproperties.demo", name: "Demo", role: "DATA_MANAGER", status: "ACTIVE", organizationId: ORG }] });
    await expect(executeReset(db.client as unknown as ResetClient, { confirm: REQUIRED_EXECUTE_CONFIRMATION })).rejects.toThrow(HandoverResetAbortedError);
    expect(db.rowCount("lead")).toBe(2);
  });

  it("aborts when the handover admin is INACTIVE", async () => {
    const db = makeDb({ user: [{ id: "admin-1", email: HANDOVER_ADMIN_EMAIL, name: "Founder", role: "ADMIN", status: "INACTIVE", organizationId: ORG }] });
    await expect(executeReset(db.client as unknown as ResetClient, { confirm: REQUIRED_EXECUTE_CONFIRMATION })).rejects.toThrow(HandoverResetAbortedError);
    expect(db.rowCount("lead")).toBe(2);
  });

  it("aborts when the handover admin has the wrong role", async () => {
    const db = makeDb({ user: [{ id: "admin-1", email: HANDOVER_ADMIN_EMAIL, name: "Founder", role: "DATA_MANAGER", status: "ACTIVE", organizationId: ORG }] });
    await expect(executeReset(db.client as unknown as ResetClient, { confirm: REQUIRED_EXECUTE_CONFIRMATION })).rejects.toThrow(HandoverResetAbortedError);
    expect(db.rowCount("lead")).toBe(2);
  });

  it("aborts when the handover admin belongs to a different organization", async () => {
    const db = makeDb({ user: [{ id: "admin-1", email: HANDOVER_ADMIN_EMAIL, name: "Founder", role: "ADMIN", status: "ACTIVE", organizationId: "some-other-org" }] });
    await expect(executeReset(db.client as unknown as ResetClient, { confirm: REQUIRED_EXECUTE_CONFIRMATION })).rejects.toThrow(HandoverResetAbortedError);
    expect(db.rowCount("lead")).toBe(2);
  });

  it("aborts when the migration count does not match", async () => {
    const db = makeDb({}, { appliedMigrationCount: 5 });
    await expect(executeReset(db.client as unknown as ResetClient, { confirm: REQUIRED_EXECUTE_CONFIRMATION })).rejects.toThrow(HandoverResetAbortedError);
    expect(db.rowCount("lead")).toBe(2);
  });

  it("aborts when the database doesn't look like this project's schema", async () => {
    const db = makeDb({}, { missingCoreTables: ["properties"] });
    await expect(executeReset(db.client as unknown as ResetClient, { confirm: REQUIRED_EXECUTE_CONFIRMATION })).rejects.toThrow(HandoverResetAbortedError);
    expect(db.rowCount("lead")).toBe(2);
  });
});

describe("executeReset - a real execute run against the (fake, transactional) test DB", () => {
  it("preserves the handover admin, deletes other users, deletes operational data, and leaves Organization/SystemConfig/PropertyPortalConnection untouched", async () => {
    const db = makeDb();
    const result = await executeReset(db.client as unknown as ResetClient, { confirm: REQUIRED_EXECUTE_CONFIRMATION });

    expect(result.preservedAdminId).toBe("admin-1");
    expect(db.hasRow("user", "admin-1")).toBe(true);
    expect(db.hasRow("user", "emp-1")).toBe(false);
    expect(db.hasRow("user", "emp-2")).toBe(false);
    expect(result.deletedUserCount).toBe(2);

    expect(db.rowCount("lead")).toBe(0);
    expect(db.rowCount("property")).toBe(0);
    expect(db.rowCount("importJob")).toBe(0);
    expect(db.rowCount("importRecord")).toBe(0);

    // Never touched, regardless of the reset.
    expect(db.hasRow("organization", ORG)).toBe(true);
    expect(db.rowCount("systemConfig")).toBe(1);
    expect(db.rowCount("propertyPortalConnection")).toBe(1);
    expect(db.hasRow("propertyPortalConnection", "conn-1")).toBe(true);
  });

  it("deletes every model in the deletion plan, not just a hand-picked subset", async () => {
    const db = makeDb();
    await executeReset(db.client as unknown as ResetClient, { confirm: REQUIRED_EXECUTE_CONFIRMATION });
    for (const step of DELETION_PLAN) {
      expect(db.rowCount(step.model)).toBe(0);
    }
  });
});

describe("executeReset - transaction rollback on a mid-run failure", () => {
  it("rolls back every write made so far when a later step throws", async () => {
    // "lead" sits well past the front of DELETION_PLAN - several models are
    // deleted before it. Injecting a failure exactly there proves rollback
    // undoes those already-applied deletes too, not just the one that threw.
    const db = makeDb({}, { failOnDeleteMany: "lead" });

    await expect(executeReset(db.client as unknown as ResetClient, { confirm: REQUIRED_EXECUTE_CONFIRMATION })).rejects.toThrow(
      "simulated mid-transaction failure"
    );

    // Everything the transaction had already deleted before hitting `lead`
    // must be restored - rollback is all-or-nothing, not "whatever succeeded so far".
    expect(db.rowCount("leadAssignmentHistory")).toBe(1);
    expect(db.rowCount("catalogueVersionEvent")).toBe(1);
    expect(db.rowCount("deal")).toBe(1);
    expect(db.rowCount("visit")).toBe(1);
    // And Lead itself (the step that actually threw) is of course untouched too.
    expect(db.rowCount("lead")).toBe(2);
    // Users must not have been deleted either - that step never even ran.
    expect(db.hasRow("user", "emp-1")).toBe(true);
    expect(db.hasRow("user", "emp-2")).toBe(true);
  });

  it("leaves the Organization/SystemConfig/PropertyPortalConnection rows exactly as found after a rollback, same as before any attempt", async () => {
    const db = makeDb({}, { failOnDeleteMany: "property" });
    await expect(executeReset(db.client as unknown as ResetClient, { confirm: REQUIRED_EXECUTE_CONFIRMATION })).rejects.toThrow();
    expect(db.hasRow("organization", ORG)).toBe(true);
    expect(db.rowCount("systemConfig")).toBe(1);
    expect(db.rowCount("propertyPortalConnection")).toBe(1);
  });
});
