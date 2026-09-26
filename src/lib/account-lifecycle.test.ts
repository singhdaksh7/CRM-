import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./api-auth", () => ({ ApiError: class ApiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } } }));

const userFindFirst = vi.fn();
const userUpdateMany = vi.fn();
const userCount = vi.fn();
const userDelete = vi.fn();
const setupCount = vi.fn();
const setupUpdateMany = vi.fn();
const resetDeleteMany = vi.fn();
const auditCreate = vi.fn();

const tx = {
  user: { findFirst: userFindFirst, updateMany: userUpdateMany, count: userCount, delete: userDelete },
  accountSetupToken: { count: setupCount, updateMany: setupUpdateMany },
  passwordResetToken: { deleteMany: resetDeleteMany },
  auditLog: { create: auditCreate },
};
const transaction = vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx));
vi.mock("./prisma", () => ({ prisma: { $transaction: transaction } }));

const { disableEmployeeAccount, enableEmployeeAccount, deleteEmployeeAccount, hasCompletedAccountSetup } = await import("./account-lifecycle");

function employeeWithZeroHistory(overrides: Partial<{ id: string; name: string; email: string; role: string; status: string }> = {}) {
  return {
    id: "u1",
    name: "Test Employee",
    email: "test@example.com",
    role: "FIELD_EXECUTIVE",
    status: "INACTIVE",
    ...overrides,
    _count: {
      assignedLeads: 0, assignedVisits: 0, visitConflictOverrides: 0, createdVisits: 0, visitPropertiesVisited: 0,
      scheduledCatalogueRequests: 0, followUps: 0, activities: 0, sharedProperties: 0, leadTransfersFrom: 0, leadTransfersTo: 0,
      propertiesAdded: 0, assignmentRules: 0, notifications: 0, whatsappMessagesSent: 0, whatsappConversationsAssigned: 0,
      cataloguesCreated: 0, catalogueShareProperties: 0, ownersCreated: 0, ownersVerified: 0, dealsAssigned: 0, dealsCreated: 0,
      brokerageCalculationsMade: 0, brokerageIncentives: 0, paymentsRecorded: 0, documentsUploaded: 0, propertyImagesUploaded: 0,
      importJobsCreated: 0, importMappingPresetsCreated: 0, auditLogs: 0, backupsTriggered: 0, restoreValidationsDone: 0,
      savedViews: 0, systemConfigsUpdated: 0, automationRulesCreated: 0, inventoryPartnersCreated: 0, propertiesLastVerified: 0,
      propertiesLocationCaptured: 0, propertyLocalitiesCreated: 0, propertyLocalityAliasesCreated: 0, propertyTimelineEventsActed: 0,
      availabilityReportsSubmitted: 0, availabilityReportsReviewed: 0, propertyReportsSubmitted: 0, propertyReportsResolved: 0,
      visitFeedbackSubmitted: 0, leadPhonesCreated: 0, leadAssignmentHistoryTo: 0, catalogueExecutiveStatusUpdates: 0,
      catalogueVersionEventsActed: 0, propertyFavorites: 0, propertyViewLogs: 0, dealOffers: 0, requirementBroadcasts: 0,
      matchRecommendations: 0, customerContactsCreated: 0, customerRequirementsCreated: 0, propertyRecommendationsCreated: 0,
      propertyRecommendationsResponded: 0, leadRequirementsCreated: 0,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  userUpdateMany.mockResolvedValue({ count: 1 });
  userCount.mockResolvedValue(1);
  userDelete.mockResolvedValue({ id: "u1" });
  setupUpdateMany.mockResolvedValue({ count: 0 });
  resetDeleteMany.mockResolvedValue({ count: 0 });
  setupCount.mockResolvedValue(0);
});

describe("disableEmployeeAccount", () => {
  beforeEach(() => userFindFirst.mockResolvedValue({ id: "u1", status: "ACTIVE" }));

  it("sets INACTIVE and increments authVersion so live sessions are revoked", async () => {
    await expect(disableEmployeeAccount({ employeeId: "u1", organizationId: "org1", actorId: "admin1" }))
      .resolves.toEqual({ id: "u1", status: "INACTIVE" });
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: "u1", organizationId: "org1", status: "ACTIVE" },
      data: { status: "INACTIVE", authVersion: { increment: 1 } },
    });
  });

  it("destroys outstanding reset links and expires outstanding setup links", async () => {
    await disableEmployeeAccount({ employeeId: "u1", organizationId: "org1", actorId: "admin1" });
    expect(resetDeleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(setupUpdateMany).toHaveBeenCalledWith({ where: { userId: "u1", usedAt: null }, data: { expiresAt: new Date(0) } });
  });

  it("audits ACCOUNT_DISABLED with no secrets", async () => {
    await disableEmployeeAccount({ employeeId: "u1", organizationId: "org1", actorId: "admin1" });
    const audit = JSON.stringify(auditCreate.mock.calls);
    expect(audit).toContain("account_disabled");
    expect(audit).not.toMatch(/passwordHash|tokenHash/);
  });

  it("rejects a cross-organization employee id as not found", async () => {
    userFindFirst.mockResolvedValueOnce(null);
    await expect(disableEmployeeAccount({ employeeId: "u1", organizationId: "other", actorId: "admin1" })).rejects.toMatchObject({ status: 404 });
    expect(userUpdateMany).not.toHaveBeenCalled();
  });

  it.each(["PENDING_SETUP", "INACTIVE"])("refuses to disable a %s employee", async (status) => {
    userFindFirst.mockResolvedValueOnce({ id: "u1", status });
    await expect(disableEmployeeAccount({ employeeId: "u1", organizationId: "org1", actorId: "admin1" })).rejects.toMatchObject({ status: 409 });
    expect(userUpdateMany).not.toHaveBeenCalled();
  });

  it("is race-safe: a concurrent disable that already won leaves count 0 and this one fails", async () => {
    userUpdateMany.mockResolvedValueOnce({ count: 0 });
    await expect(disableEmployeeAccount({ employeeId: "u1", organizationId: "org1", actorId: "admin1" })).rejects.toMatchObject({ status: 409 });
  });

  it("refuses to let an admin disable their own account", async () => {
    userFindFirst.mockResolvedValueOnce({ id: "admin1", status: "ACTIVE", role: "ADMIN" });
    await expect(disableEmployeeAccount({ employeeId: "admin1", organizationId: "org1", actorId: "admin1" })).rejects.toMatchObject({ status: 400 });
    expect(userUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses to disable the only other active admin, leaving the org lockable-out", async () => {
    userFindFirst.mockResolvedValueOnce({ id: "u1", status: "ACTIVE", role: "ADMIN" });
    userCount.mockResolvedValueOnce(0); // no other active admins besides u1
    await expect(disableEmployeeAccount({ employeeId: "u1", organizationId: "org1", actorId: "admin2" })).rejects.toMatchObject({ status: 400 });
    expect(userUpdateMany).not.toHaveBeenCalled();
  });

  it("allows disabling an admin when another active admin still exists", async () => {
    userFindFirst.mockResolvedValueOnce({ id: "u1", status: "ACTIVE", role: "ADMIN" });
    userCount.mockResolvedValueOnce(1); // one other active admin
    await expect(disableEmployeeAccount({ employeeId: "u1", organizationId: "org1", actorId: "admin2" }))
      .resolves.toEqual({ id: "u1", status: "INACTIVE" });
  });

  it("does not run the admin-lockout check for a non-admin employee", async () => {
    userFindFirst.mockResolvedValueOnce({ id: "u1", status: "ACTIVE", role: "FIELD_EXECUTIVE" });
    await disableEmployeeAccount({ employeeId: "u1", organizationId: "org1", actorId: "admin1" });
    expect(userCount).not.toHaveBeenCalled();
  });
});

describe("enableEmployeeAccount", () => {
  beforeEach(() => userFindFirst.mockResolvedValue({ id: "u1", status: "INACTIVE" }));

  it("restores an employee who completed setup to ACTIVE", async () => {
    setupCount.mockResolvedValueOnce(1).mockResolvedValueOnce(0); // one used, none unused
    await expect(enableEmployeeAccount({ employeeId: "u1", organizationId: "org1", actorId: "admin1" }))
      .resolves.toEqual({ id: "u1", status: "ACTIVE" });
  });

  it("restores an employee who never completed setup to PENDING_SETUP, not ACTIVE", async () => {
    setupCount.mockResolvedValueOnce(0).mockResolvedValueOnce(1); // none used, one still unused
    await expect(enableEmployeeAccount({ employeeId: "u1", organizationId: "org1", actorId: "admin1" }))
      .resolves.toEqual({ id: "u1", status: "PENDING_SETUP" });
  });

  it("treats a legacy employee with no setup tokens at all as already configured", async () => {
    setupCount.mockResolvedValue(0);
    await expect(enableEmployeeAccount({ employeeId: "u1", organizationId: "org1", actorId: "admin1" }))
      .resolves.toEqual({ id: "u1", status: "ACTIVE" });
  });

  it("does not change authVersion - enabling grants access, it doesn't revoke it", async () => {
    setupCount.mockResolvedValue(0);
    await enableEmployeeAccount({ employeeId: "u1", organizationId: "org1", actorId: "admin1" });
    expect(userUpdateMany.mock.calls[0][0].data).toEqual({ status: "ACTIVE" });
  });

  it("audits ACCOUNT_ENABLED with the resulting status", async () => {
    setupCount.mockResolvedValue(0);
    await enableEmployeeAccount({ employeeId: "u1", organizationId: "org1", actorId: "admin1" });
    expect(JSON.stringify(auditCreate.mock.calls)).toContain("account_enabled");
  });

  it("rejects a cross-organization employee id as not found", async () => {
    userFindFirst.mockResolvedValueOnce(null);
    await expect(enableEmployeeAccount({ employeeId: "u1", organizationId: "other", actorId: "admin1" })).rejects.toMatchObject({ status: 404 });
  });

  it.each(["ACTIVE", "PENDING_SETUP"])("refuses to enable an employee already in %s", async (status) => {
    userFindFirst.mockResolvedValueOnce({ id: "u1", status });
    await expect(enableEmployeeAccount({ employeeId: "u1", organizationId: "org1", actorId: "admin1" })).rejects.toMatchObject({ status: 409 });
  });
});

describe("deleteEmployeeAccount", () => {
  it("permanently deletes a deactivated employee with zero CRM history", async () => {
    userFindFirst.mockResolvedValueOnce(employeeWithZeroHistory());
    await expect(deleteEmployeeAccount({ employeeId: "u1", organizationId: "org1", actorId: "admin1" }))
      .resolves.toEqual({ id: "u1", deleted: true });
    expect(userDelete).toHaveBeenCalledWith({ where: { id: "u1" } });
  });

  it("refuses to delete an account that is not yet deactivated", async () => {
    userFindFirst.mockResolvedValueOnce(employeeWithZeroHistory({ status: "ACTIVE" }));
    await expect(deleteEmployeeAccount({ employeeId: "u1", organizationId: "org1", actorId: "admin1" })).rejects.toMatchObject({ status: 409 });
    expect(userDelete).not.toHaveBeenCalled();
  });

  it("refuses to delete when the employee has attached CRM history, naming what's attached", async () => {
    const employee = employeeWithZeroHistory();
    employee._count.assignedLeads = 3;
    employee._count.documentsUploaded = 1;
    userFindFirst.mockResolvedValueOnce(employee);
    await expect(deleteEmployeeAccount({ employeeId: "u1", organizationId: "org1", actorId: "admin1" })).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("assigned leads (3)"),
    });
    expect(userDelete).not.toHaveBeenCalled();
  });

  it("refuses to let an admin delete their own account", async () => {
    userFindFirst.mockResolvedValueOnce(employeeWithZeroHistory({ id: "admin1", role: "ADMIN" }));
    await expect(deleteEmployeeAccount({ employeeId: "admin1", organizationId: "org1", actorId: "admin1" })).rejects.toMatchObject({ status: 400 });
    expect(userDelete).not.toHaveBeenCalled();
  });

  it("refuses to delete the only admin in the organization", async () => {
    userFindFirst.mockResolvedValueOnce(employeeWithZeroHistory({ role: "ADMIN" }));
    userCount.mockResolvedValueOnce(0);
    await expect(deleteEmployeeAccount({ employeeId: "u1", organizationId: "org1", actorId: "admin2" })).rejects.toMatchObject({ status: 400 });
    expect(userDelete).not.toHaveBeenCalled();
  });

  it("allows deleting an admin when another admin still exists", async () => {
    userFindFirst.mockResolvedValueOnce(employeeWithZeroHistory({ role: "ADMIN" }));
    userCount.mockResolvedValueOnce(1);
    await expect(deleteEmployeeAccount({ employeeId: "u1", organizationId: "org1", actorId: "admin2" })).resolves.toEqual({ id: "u1", deleted: true });
  });

  it("rejects a cross-organization employee id as not found", async () => {
    userFindFirst.mockResolvedValueOnce(null);
    await expect(deleteEmployeeAccount({ employeeId: "u1", organizationId: "other", actorId: "admin1" })).rejects.toMatchObject({ status: 404 });
    expect(userDelete).not.toHaveBeenCalled();
  });

  it("audits ACCOUNT_DELETED before deleting, using the actor's id (not the deleted user's)", async () => {
    userFindFirst.mockResolvedValueOnce(employeeWithZeroHistory());
    await deleteEmployeeAccount({ employeeId: "u1", organizationId: "org1", actorId: "admin1" });
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: "admin1", action: "DELETE", entityId: "u1" }),
    }));
    expect(JSON.stringify(auditCreate.mock.calls)).toContain("account_deleted");
  });
});

describe("hasCompletedAccountSetup", () => {
  it.each([
    ["a consumed setup token exists", 1, 0, true],
    ["a consumed one exists alongside a fresh one", 1, 1, true],
    ["only an unconsumed token exists", 0, 1, false],
    ["no token rows exist (legacy/seeded user)", 0, 0, true],
  ])("returns %s -> %s", async (_label, used, unused, expected) => {
    setupCount.mockResolvedValueOnce(used).mockResolvedValueOnce(unused);
    await expect(hasCompletedAccountSetup(tx as never, "u1")).resolves.toBe(expected);
  });
});
