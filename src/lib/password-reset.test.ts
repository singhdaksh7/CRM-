import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

vi.mock("server-only", () => ({}));

const tokenFindUnique = vi.fn();
const tokenCreate = vi.fn();
const tokenDeleteMany = vi.fn();
const tokenUpdateMany = vi.fn();
const userFindFirst = vi.fn();
const userFindUnique = vi.fn();
const userUpdateMany = vi.fn();
const auditCreate = vi.fn();

const tx = {
  passwordResetToken: { findUnique: tokenFindUnique, create: tokenCreate, deleteMany: tokenDeleteMany, updateMany: tokenUpdateMany },
  user: { findFirst: userFindFirst, updateMany: userUpdateMany },
  auditLog: { create: auditCreate },
};
const transaction = vi.fn(async (callback: (client: unknown) => unknown) => callback(tx));

vi.mock("./prisma", () => ({
  prisma: {
    passwordResetToken: { findUnique: tokenFindUnique },
    user: { findUnique: userFindUnique },
    auditLog: { create: auditCreate },
    $transaction: transaction,
  },
}));

// api-auth pulls in the Auth.js entrypoint, which can't be imported under the
// node test environment - the same stub the account-setup suite uses.
vi.mock("./api-auth", () => ({ ApiError: class ApiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } } }));

const hash = vi.fn(async (value: string) => `bcrypt:${value}`);
const compare = vi.fn();
vi.mock("bcryptjs", () => ({ default: { hash, compare } }));

const {
  hashPasswordResetToken,
  buildPasswordResetUrl,
  createPasswordResetSecret,
  issuePasswordResetToken,
  inspectPasswordResetToken,
  completePasswordReset,
  changeOwnPassword,
  recordPasswordResetRequest,
  PASSWORD_RESET_EXPIRY_MINUTES,
  INVALID_RESET_TOKEN_MESSAGE,
} = await import("./password-reset");

const NOW = new Date("2026-08-17T10:00:00Z");
const LATER = new Date("2026-08-17T10:30:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  userUpdateMany.mockResolvedValue({ count: 1 });
  tokenUpdateMany.mockResolvedValue({ count: 1 });
  tokenDeleteMany.mockResolvedValue({ count: 0 });
});

describe("reset token generation", () => {
  it("mints 256 bits of entropy, base64url encoded, and never repeats", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => createPasswordResetSecret().token));
    expect(tokens.size).toBe(200);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(Buffer.from(token, "base64url")).toHaveLength(32);
    }
  });

  it("persists only a SHA-256 hash, never the plaintext", () => {
    const secret = createPasswordResetSecret();
    expect(secret.tokenHash).toBe(createHash("sha256").update(secret.token, "utf8").digest("hex"));
    expect(secret.tokenHash).toHaveLength(64);
    expect(secret.tokenHash).not.toContain(secret.token);
  });

  it("expires inside the 30-60 minute window", () => {
    expect(PASSWORD_RESET_EXPIRY_MINUTES).toBeGreaterThanOrEqual(30);
    expect(PASSWORD_RESET_EXPIRY_MINUTES).toBeLessThanOrEqual(60);
    const secret = createPasswordResetSecret(NOW);
    expect(secret.expiresAt.getTime() - NOW.getTime()).toBe(PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000);
  });

  it("hashes deterministically so an incoming token can be looked up", () => {
    expect(hashPasswordResetToken("abc")).toBe(hashPasswordResetToken("abc"));
    expect(hashPasswordResetToken("abc")).not.toBe(hashPasswordResetToken("abd"));
  });

  it("builds a URL-encoded reset link", () => {
    expect(buildPasswordResetUrl("tok-en")).toContain("/reset-password/tok-en");
  });
});

describe("issuePasswordResetToken", () => {
  it("issues for an ACTIVE employee, returns the plaintext once, and stores only the hash", async () => {
    userFindFirst.mockResolvedValue({ id: "u1", status: "ACTIVE" });
    const result = await issuePasswordResetToken({ userId: "u1", organizationId: "org1", actorId: "admin1" });

    expect(result.resetUrl).toContain("/reset-password/");
    const plaintext = decodeURIComponent(result.resetUrl.split("/reset-password/")[1]);
    const stored = tokenCreate.mock.calls[0][0].data;
    expect(stored.tokenHash).toBe(hashPasswordResetToken(plaintext));
    expect(JSON.stringify(tokenCreate.mock.calls)).not.toContain(plaintext);
  });

  it("invalidates every outstanding token for that user before creating a new one", async () => {
    userFindFirst.mockResolvedValue({ id: "u1", status: "ACTIVE" });
    await issuePasswordResetToken({ userId: "u1", organizationId: "org1", actorId: "admin1" });
    expect(tokenDeleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(tokenDeleteMany.mock.invocationCallOrder[0]).toBeLessThan(tokenCreate.mock.invocationCallOrder[0]);
  });

  it("records an audit event without the plaintext token", async () => {
    userFindFirst.mockResolvedValue({ id: "u1", status: "ACTIVE" });
    const result = await issuePasswordResetToken({ userId: "u1", organizationId: "org1", actorId: "admin1" });
    const plaintext = decodeURIComponent(result.resetUrl.split("/reset-password/")[1]);
    const audit = JSON.stringify(auditCreate.mock.calls);
    expect(audit).toContain("password_reset_link_generated");
    expect(audit).not.toContain(plaintext);
    expect(audit).not.toContain("tokenHash");
  });

  it("rejects an employee from another organization as not found", async () => {
    userFindFirst.mockResolvedValue(null);
    await expect(issuePasswordResetToken({ userId: "u1", organizationId: "other-org", actorId: "admin1" })).rejects.toMatchObject({ status: 404 });
    expect(tokenCreate).not.toHaveBeenCalled();
  });

  it.each(["PENDING_SETUP", "INACTIVE"])("refuses to issue a reset link for a %s employee", async (status) => {
    userFindFirst.mockResolvedValue({ id: "u1", status });
    await expect(issuePasswordResetToken({ userId: "u1", organizationId: "org1", actorId: "admin1" })).rejects.toMatchObject({ status: 409 });
    expect(tokenCreate).not.toHaveBeenCalled();
  });
});

describe("inspectPasswordResetToken", () => {
  const valid = { expiresAt: LATER, usedAt: null, user: { name: "Sagar Kumar", status: "ACTIVE" } };

  it("accepts a live token and exposes only a first name", async () => {
    tokenFindUnique.mockResolvedValue(valid);
    await expect(inspectPasswordResetToken("token", NOW)).resolves.toEqual({ firstName: "Sagar", expiresAt: LATER });
  });

  it("looks the token up by hash, never by plaintext", async () => {
    tokenFindUnique.mockResolvedValue(valid);
    await inspectPasswordResetToken("plain-token", NOW);
    expect(tokenFindUnique.mock.calls[0][0].where.tokenHash).toBe(hashPasswordResetToken("plain-token"));
  });

  it.each([
    ["unknown", null],
    ["already used", { ...valid, usedAt: NOW }],
    ["expired", { ...valid, expiresAt: new Date("2026-08-17T09:00:00Z") }],
    ["pending user", { ...valid, user: { name: "S", status: "PENDING_SETUP" } }],
    ["disabled user", { ...valid, user: { name: "S", status: "INACTIVE" } }],
  ])("rejects a %s token with an indistinguishable null", async (_label, row) => {
    tokenFindUnique.mockResolvedValue(row);
    await expect(inspectPasswordResetToken("token", NOW)).resolves.toBeNull();
  });

  it("rejects absurdly long input without querying the database", async () => {
    await expect(inspectPasswordResetToken("x".repeat(500), NOW)).resolves.toBeNull();
    expect(tokenFindUnique).not.toHaveBeenCalled();
  });
});

describe("completePasswordReset", () => {
  const live = { id: "t1", userId: "u1", organizationId: "org1", expiresAt: LATER, usedAt: null, user: { status: "ACTIVE" } };

  it("consumes the token, writes a new bcrypt hash, and bumps authVersion in one transaction", async () => {
    tokenFindUnique.mockResolvedValue(live);
    await expect(completePasswordReset("token", "brand-new-password", NOW)).resolves.toEqual({ userId: "u1" });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(hash).toHaveBeenCalledWith("brand-new-password", 10);
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: "u1", organizationId: "org1", status: "ACTIVE" },
      data: { passwordHash: "bcrypt:brand-new-password", authVersion: { increment: 1 } },
    });
  });

  it("consumes the token with a guarded update so a replay finds nothing left", async () => {
    tokenFindUnique.mockResolvedValue(live);
    await completePasswordReset("token", "brand-new-password", NOW);
    expect(tokenUpdateMany).toHaveBeenCalledWith({
      where: { id: "t1", usedAt: null, expiresAt: { gt: NOW } },
      data: { usedAt: NOW },
    });
  });

  it("is race-safe: a concurrent winner leaves count 0 and the loser is rejected", async () => {
    tokenFindUnique.mockResolvedValue(live);
    tokenUpdateMany.mockResolvedValueOnce({ count: 0 });
    await expect(completePasswordReset("token", "brand-new-password", NOW)).rejects.toMatchObject({ status: 400, message: INVALID_RESET_TOKEN_MESSAGE });
    expect(userUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects if the user stopped being ACTIVE between the read and the write", async () => {
    tokenFindUnique.mockResolvedValue(live);
    userUpdateMany.mockResolvedValueOnce({ count: 0 });
    await expect(completePasswordReset("token", "brand-new-password", NOW)).rejects.toMatchObject({ status: 400 });
  });

  it("invalidates the user's other unused reset tokens", async () => {
    tokenFindUnique.mockResolvedValue(live);
    await completePasswordReset("token", "brand-new-password", NOW);
    expect(tokenUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u1", id: { not: "t1" }, usedAt: null },
      data: { usedAt: NOW },
    });
  });

  it.each([
    ["unknown", null],
    ["already used (replay)", { ...live, usedAt: NOW }],
    ["expired", { ...live, expiresAt: new Date("2026-08-17T09:00:00Z") }],
    ["pending-user", { ...live, user: { status: "PENDING_SETUP" } }],
    ["disabled-user", { ...live, user: { status: "INACTIVE" } }],
  ])("rejects a %s token with one generic message and no password write", async (_label, row) => {
    tokenFindUnique.mockResolvedValue(row);
    await expect(completePasswordReset("token", "brand-new-password", NOW)).rejects.toMatchObject({ status: 400, message: INVALID_RESET_TOKEN_MESSAGE });
    expect(userUpdateMany).not.toHaveBeenCalled();
  });

  it("audits the completion without recording the password, its hash, or the token", async () => {
    tokenFindUnique.mockResolvedValue(live);
    await completePasswordReset("super-secret-token", "brand-new-password", NOW);
    const audit = JSON.stringify(auditCreate.mock.calls);
    expect(audit).toContain("password_reset_completed");
    expect(audit).not.toContain("brand-new-password");
    expect(audit).not.toContain("bcrypt:");
    expect(audit).not.toContain("super-secret-token");
  });
});

describe("changeOwnPassword", () => {
  const active = { id: "u1", organizationId: "org1", status: "ACTIVE", passwordHash: "bcrypt:old" };

  beforeEach(() => {
    userFindUnique.mockResolvedValue(active);
    compare.mockResolvedValue(true);
  });

  it("verifies the current password, rehashes, and bumps authVersion", async () => {
    await expect(changeOwnPassword({ userId: "u1", currentPassword: "old", newPassword: "the-new-one", now: NOW })).resolves.toEqual({ userId: "u1" });
    expect(compare).toHaveBeenCalledWith("old", "bcrypt:old");
    expect(hash).toHaveBeenCalledWith("the-new-one", 10);
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: "u1", status: "ACTIVE" },
      data: { passwordHash: "bcrypt:the-new-one", authVersion: { increment: 1 } },
    });
  });

  it("rejects a wrong current password without writing anything", async () => {
    compare.mockResolvedValueOnce(false);
    await expect(changeOwnPassword({ userId: "u1", currentPassword: "wrong", newPassword: "the-new-one", now: NOW })).rejects.toMatchObject({ status: 400 });
    expect(userUpdateMany).not.toHaveBeenCalled();
  });

  it.each(["PENDING_SETUP", "INACTIVE"])("refuses for a %s account before checking bcrypt", async (status) => {
    userFindUnique.mockResolvedValueOnce({ ...active, status });
    await expect(changeOwnPassword({ userId: "u1", currentPassword: "old", newPassword: "the-new-one", now: NOW })).rejects.toMatchObject({ status: 403 });
    expect(compare).not.toHaveBeenCalled();
  });

  it("refuses for a user that no longer exists", async () => {
    userFindUnique.mockResolvedValueOnce(null);
    await expect(changeOwnPassword({ userId: "gone", currentPassword: "old", newPassword: "the-new-one", now: NOW })).rejects.toMatchObject({ status: 403 });
  });

  it("burns any outstanding reset token so an old link can't undo the change", async () => {
    await changeOwnPassword({ userId: "u1", currentPassword: "old", newPassword: "the-new-one", now: NOW });
    expect(tokenUpdateMany).toHaveBeenCalledWith({ where: { userId: "u1", usedAt: null }, data: { usedAt: NOW } });
  });

  it("audits PASSWORD_CHANGED without either password", async () => {
    await changeOwnPassword({ userId: "u1", currentPassword: "old-secret", newPassword: "new-secret-value", now: NOW });
    const audit = JSON.stringify(auditCreate.mock.calls);
    expect(audit).toContain("password_changed");
    expect(audit).not.toContain("old-secret");
    expect(audit).not.toContain("new-secret-value");
  });
});

describe("recordPasswordResetRequest", () => {
  it("audits the request for a known ACTIVE account", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", organizationId: "org1", status: "ACTIVE" });
    await expect(recordPasswordResetRequest("Sagar@Example.com")).resolves.toBeUndefined();
    expect(userFindUnique.mock.calls[0][0].where.email).toBe("sagar@example.com");
    expect(JSON.stringify(auditCreate.mock.calls)).toContain("password_reset_requested");
  });

  it.each([
    ["unknown email", null],
    ["pending account", { id: "u1", organizationId: "org1", status: "PENDING_SETUP" }],
    ["disabled account", { id: "u1", organizationId: "org1", status: "INACTIVE" }],
  ])("resolves silently for a %s, writing nothing", async (_label, row) => {
    userFindUnique.mockResolvedValue(row);
    await expect(recordPasswordResetRequest("someone@example.com")).resolves.toBeUndefined();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("never mints a token from the public path - only an admin can issue one", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", organizationId: "org1", status: "ACTIVE" });
    await recordPasswordResetRequest("sagar@example.com");
    expect(tokenCreate).not.toHaveBeenCalled();
  });

  it("swallows a database failure rather than turning it into a distinguishable signal", async () => {
    userFindUnique.mockRejectedValueOnce(new Error("db down"));
    await expect(recordPasswordResetRequest("sagar@example.com")).resolves.toBeUndefined();
  });

  it("ignores empty and oversized input without querying", async () => {
    await recordPasswordResetRequest("   ");
    await recordPasswordResetRequest(`${"x".repeat(400)}@example.com`);
    expect(userFindUnique).not.toHaveBeenCalled();
  });
});
