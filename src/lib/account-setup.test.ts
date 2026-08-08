import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const tx = {
  user: { findFirst: vi.fn(), updateMany: vi.fn() },
  accountSetupToken: { findUnique: vi.fn(), deleteMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  auditLog: { create: vi.fn() },
};
const prismaMock = {
  accountSetupToken: { findUnique: vi.fn() },
  $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
};
vi.mock("./prisma", () => ({ prisma: prismaMock }));
vi.mock("./api-auth", () => ({ ApiError: class ApiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } } }));

const { activateAccount, buildAccountSetupUrl, createAccountSetupSecret, hashAccountSetupToken, inspectAccountSetupToken, issueAccountSetupToken } = await import("./account-setup");

const NOW = new Date("2026-08-08T00:00:00.000Z");
const validRow = { id: "t1", userId: "u1", organizationId: "org1", expiresAt: new Date("2026-08-09T00:00:00.000Z"), usedAt: null, user: { status: "PENDING_SETUP" } };

beforeEach(() => {
  vi.clearAllMocks();
  tx.accountSetupToken.findUnique.mockResolvedValue(validRow);
  tx.accountSetupToken.updateMany.mockResolvedValue({ count: 1 });
  tx.user.updateMany.mockResolvedValue({ count: 1 });
  tx.user.findFirst.mockResolvedValue({ id: "u1", status: "PENDING_SETUP" });
  prismaMock.accountSetupToken.findUnique.mockResolvedValue({ expiresAt: validRow.expiresAt, usedAt: null, user: { name: "Sagar Kumar", status: "PENDING_SETUP" } });
  process.env.NEXT_PUBLIC_APP_URL = "https://crm.example.com";
});

describe("account setup tokens", () => {
  it("generates a high-entropy token and stores a different deterministic hash", () => {
    const secret = createAccountSetupSecret(NOW);
    expect(secret.token.length).toBeGreaterThanOrEqual(40);
    expect(secret.tokenHash).toBe(hashAccountSetupToken(secret.token));
    expect(secret.tokenHash).not.toContain(secret.token);
    expect(secret.expiresAt).toEqual(new Date("2026-08-10T00:00:00.000Z"));
  });

  it("builds a mobile-safe HTTPS route", () => {
    expect(buildAccountSetupUrl("abc_-123")).toBe("https://crm.example.com/setup-account/abc_-123");
  });

  it("accepts a valid unused pending-account token without exposing email", async () => {
    await expect(inspectAccountSetupToken("plain", NOW)).resolves.toEqual({ firstName: "Sagar", expiresAt: validRow.expiresAt });
  });

  it.each([
    ["missing", null],
    ["used", { expiresAt: validRow.expiresAt, usedAt: NOW, user: { name: "A", status: "PENDING_SETUP" } }],
    ["expired", { expiresAt: NOW, usedAt: null, user: { name: "A", status: "PENDING_SETUP" } }],
    ["active", { expiresAt: validRow.expiresAt, usedAt: null, user: { name: "A", status: "ACTIVE" } }],
    ["disabled", { expiresAt: validRow.expiresAt, usedAt: null, user: { name: "A", status: "INACTIVE" } }],
  ])("rejects a %s token", async (_label, row) => {
    prismaMock.accountSetupToken.findUnique.mockResolvedValueOnce(row);
    await expect(inspectAccountSetupToken("plain", NOW)).resolves.toBeNull();
  });

  it("activates, consumes, invalidates other tokens, and audits without secrets", async () => {
    await activateAccount("plain-token", "secure password", NOW);
    expect(tx.accountSetupToken.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: expect.objectContaining({ id: "t1", usedAt: null }) }));
    expect(tx.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "PENDING_SETUP" }), data: expect.objectContaining({ status: "ACTIVE", passwordHash: expect.any(String) }) }));
    expect(tx.accountSetupToken.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: expect.objectContaining({ userId: "u1", id: { not: "t1" } }), data: { usedAt: NOW } }));
    const audit = tx.auditLog.create.mock.calls[0][0].data;
    expect(audit.newValues).toBe(JSON.stringify({ event: "account_setup_completed" }));
    expect(JSON.stringify(audit)).not.toContain("plain-token");
    expect(JSON.stringify(audit)).not.toContain("secure password");
  });

  it("rejects replay/race when atomic token consumption loses", async () => {
    tx.accountSetupToken.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(activateAccount("plain", "secure password", NOW)).rejects.toThrow("invalid or has expired");
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });

  it("regeneration invalidates old tokens and stores only the new hash", async () => {
    const result = await issueAccountSetupToken({ userId: "u1", organizationId: "org1", actorId: "admin1" });
    expect(tx.accountSetupToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    const data = tx.accountSetupToken.create.mock.calls[0][0].data;
    expect(result.setupUrl).not.toContain(data.tokenHash);
    expect(data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each(["ACTIVE", "INACTIVE"])("does not issue activation links to %s users", async (status) => {
    tx.user.findFirst.mockResolvedValueOnce({ id: "u1", status });
    await expect(issueAccountSetupToken({ userId: "u1", organizationId: "org1", actorId: "admin1" })).rejects.toThrow("Only pending employees");
  });

  it("enforces organization scope during regeneration", async () => {
    tx.user.findFirst.mockResolvedValueOnce(null);
    await expect(issueAccountSetupToken({ userId: "other-org-user", organizationId: "org1", actorId: "admin1" })).rejects.toThrow("Employee not found");
  });
});
