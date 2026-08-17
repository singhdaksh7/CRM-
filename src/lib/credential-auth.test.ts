import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const findUnique = vi.fn();
const userUpdate = vi.fn();
const auditCreate = vi.fn();
const transaction = vi.fn(async (operations: unknown[]) => operations);
const compare = vi.fn();
vi.mock("./prisma", () => ({
  prisma: { user: { findUnique, update: userUpdate }, auditLog: { create: auditCreate }, $transaction: transaction },
}));
vi.mock("bcryptjs", () => ({ default: { compare } }));
const { verifyCredentials } = await import("./credential-auth");

const user = {
  id: "u1",
  organizationId: "org1",
  name: "Sagar",
  email: "sagar@example.com",
  role: "FIELD_EXECUTIVE",
  passwordHash: "hash",
  status: "ACTIVE",
  authVersion: 4,
};
beforeEach(() => {
  vi.clearAllMocks();
  findUnique.mockResolvedValue(user);
  compare.mockResolvedValue(true);
  userUpdate.mockReturnValue({ marker: "update" });
  auditCreate.mockReturnValue({ marker: "audit" });
});

describe("verifyCredentials", () => {
  it("allows an active account with a valid password", async () => expect(verifyCredentials("SAGAR@example.com", "valid")).resolves.toMatchObject({ id: "u1" }));

  it.each(["PENDING_SETUP", "INACTIVE"])("rejects %s before checking a password", async (status) => {
    findUnique.mockResolvedValueOnce({ ...user, status });
    await expect(verifyCredentials(user.email, "valid")).resolves.toBeNull();
    expect(compare).not.toHaveBeenCalled();
  });

  it("rejects an invalid password", async () => { compare.mockResolvedValueOnce(false); await expect(verifyCredentials(user.email, "bad")).resolves.toBeNull(); });

  it("rejects an unknown email with the same null result as a wrong password", async () => {
    findUnique.mockResolvedValueOnce(null);
    await expect(verifyCredentials("nobody@example.com", "whatever")).resolves.toBeNull();
  });

  it("carries authVersion into the session payload and never the password hash", async () => {
    const result = await verifyCredentials(user.email, "valid");
    expect(result).toEqual({ id: "u1", name: "Sagar", email: "sagar@example.com", role: "FIELD_EXECUTIVE", authVersion: 4 });
    expect(Object.keys(result!)).not.toContain("passwordHash");
  });

  it("stamps lastLoginAt and records a LOGIN audit entry on success", async () => {
    await verifyCredentials(user.email, "valid");
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { lastLoginAt: expect.any(Date) } });
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "LOGIN", userId: "u1", entityId: "u1" }),
    }));
    expect(auditCreate.mock.calls[0][0].data.newValues).toContain("login_success");
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("does not touch lastLoginAt or the audit trail for a failed attempt", async () => {
    compare.mockResolvedValueOnce(false);
    await verifyCredentials(user.email, "bad");
    expect(userUpdate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("never records the submitted password in an audit entry", async () => {
    await verifyCredentials(user.email, "hunter2-super-secret");
    expect(JSON.stringify(auditCreate.mock.calls)).not.toContain("hunter2-super-secret");
  });
});
