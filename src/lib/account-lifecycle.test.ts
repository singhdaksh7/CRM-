import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./api-auth", () => ({ ApiError: class ApiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } } }));

const userFindFirst = vi.fn();
const userUpdateMany = vi.fn();
const setupCount = vi.fn();
const setupUpdateMany = vi.fn();
const resetDeleteMany = vi.fn();
const auditCreate = vi.fn();

const tx = {
  user: { findFirst: userFindFirst, updateMany: userUpdateMany },
  accountSetupToken: { count: setupCount, updateMany: setupUpdateMany },
  passwordResetToken: { deleteMany: resetDeleteMany },
  auditLog: { create: auditCreate },
};
const transaction = vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx));
vi.mock("./prisma", () => ({ prisma: { $transaction: transaction } }));

const { disableEmployeeAccount, enableEmployeeAccount, hasCompletedAccountSetup } = await import("./account-lifecycle");

beforeEach(() => {
  vi.clearAllMocks();
  userUpdateMany.mockResolvedValue({ count: 1 });
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
