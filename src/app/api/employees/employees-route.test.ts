import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const requireSession = vi.fn();
const invalidateCache = vi.fn();
const hash = vi.fn().mockResolvedValue("random-placeholder-hash");
const userCreate = vi.fn();
const tokenCreate = vi.fn();
const auditCreate = vi.fn();
const findUnique = vi.fn();
const transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback({ user: { create: userCreate }, accountSetupToken: { create: tokenCreate }, auditLog: { create: auditCreate } }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique }, $transaction: transaction } }));
vi.mock("@/lib/api-auth", () => ({ requireSession, ApiError: class ApiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }, handleApiError: (error: { status?: number; message: string }) => Response.json({ error: error.message }, { status: error.status ?? 500 }) }));
vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org1" }));
vi.mock("@/lib/cache", () => ({ invalidateCache }));
vi.mock("bcryptjs", () => ({ default: { hash } }));
vi.mock("@/lib/account-setup", () => ({
  createAccountSetupSecret: () => ({ token: "plain-setup-token", tokenHash: "hashed-setup-token", expiresAt: new Date("2026-08-10T00:00:00Z") }),
  buildAccountSetupUrl: () => "https://crm.example.com/setup-account/plain-setup-token",
}));
const { POST } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: "admin1", role: "ADMIN" } });
  findUnique.mockResolvedValue(null);
  userCreate.mockResolvedValue({ id: "u1", organizationId: "org1", name: "New Employee", email: "new@example.com", role: "FIELD_EXECUTIVE", status: "PENDING_SETUP" });
});

describe("POST /api/employees", () => {
  it("requires ADMIN, creates PENDING_SETUP, and returns a one-time link without a password", async () => {
    const response = await POST(new Request("http://localhost/api/employees", { method: "POST", body: JSON.stringify({ name: "New Employee", email: "NEW@example.com", role: "FIELD_EXECUTIVE" }) }) as never);
    const body = await response.json();
    expect(requireSession).toHaveBeenCalledWith(["ADMIN"]);
    expect(response.status).toBe(201);
    expect(userCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PENDING_SETUP", email: "new@example.com", passwordHash: "random-placeholder-hash" }) }));
    expect(hash.mock.calls[0][0]).not.toBe("Welcome@123");
    expect(tokenCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ tokenHash: "hashed-setup-token", userId: "u1", organizationId: "org1" }) });
    expect(body.setupUrl).toContain("plain-setup-token");
    expect(JSON.stringify(body)).not.toContain("passwordHash");
    expect(JSON.stringify(auditCreate.mock.calls)).not.toContain("plain-setup-token");
  });

  it("rejects duplicate email before creating credentials or tokens", async () => {
    findUnique.mockResolvedValueOnce({ id: "existing" });
    const response = await POST(new Request("http://localhost/api/employees", { method: "POST", body: JSON.stringify({ name: "New Employee", email: "new@example.com", role: "FIELD_EXECUTIVE" }) }) as never);
    expect(response.status).toBe(409);
    expect(transaction).not.toHaveBeenCalled();
  });
});
