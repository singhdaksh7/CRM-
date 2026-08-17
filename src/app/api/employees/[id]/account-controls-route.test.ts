import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

const requireSession = vi.fn();
const checkRateLimit = vi.fn();
const invalidateCache = vi.fn();
const issuePasswordResetToken = vi.fn();
const issueAccountSetupToken = vi.fn();
const disableEmployeeAccount = vi.fn();
const enableEmployeeAccount = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireSession,
  ApiError,
  handleApiError: (error: { status?: number; message: string }) =>
    error instanceof ApiError
      ? Response.json({ error: error.message }, { status: error.status })
      : Response.json({ error: "Validation failed" }, { status: 400 }),
}));
vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org1" }));
vi.mock("@/lib/cache", () => ({ invalidateCache }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit,
  rateLimitResponse: () => Response.json({ error: "Too many requests" }, { status: 429 }),
}));
vi.mock("@/lib/password-reset", () => ({ issuePasswordResetToken }));
vi.mock("@/lib/account-setup", () => ({ issueAccountSetupToken }));
vi.mock("@/lib/account-lifecycle", () => ({ disableEmployeeAccount, enableEmployeeAccount }));

const { POST: resetLinkPost } = await import("./reset-link/route");
const { POST: setupLinkPost } = await import("./setup-link/route");
const { POST: accountStatusPost } = await import("./account-status/route");

const params = () => ({ params: Promise.resolve({ id: "u1" }) });
const emptyRequest = () => new Request("http://localhost/api/employees/u1/reset-link", { method: "POST" }) as never;
const statusRequest = (body: unknown) =>
  new Request("http://localhost/api/employees/u1/account-status", { method: "POST", body: JSON.stringify(body) }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: "admin1", role: "ADMIN" } });
  checkRateLimit.mockResolvedValue({ allowed: true });
  issuePasswordResetToken.mockResolvedValue({ resetUrl: "https://crm.example.com/reset-password/plain-token", expiresAt: new Date() });
  issueAccountSetupToken.mockResolvedValue({ setupUrl: "https://crm.example.com/setup-account/plain-setup", expiresAt: new Date() });
  disableEmployeeAccount.mockResolvedValue({ id: "u1", status: "INACTIVE" });
  enableEmployeeAccount.mockResolvedValue({ id: "u1", status: "ACTIVE" });
});

describe("POST /api/employees/[id]/reset-link", () => {
  it("requires ADMIN", async () => {
    await resetLinkPost(emptyRequest(), params());
    expect(requireSession).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("denies a FIELD_EXECUTIVE before generating anything", async () => {
    requireSession.mockRejectedValueOnce(new ApiError(403, "Forbidden"));
    const response = await resetLinkPost(emptyRequest(), params());
    expect(response.status).toBe(403);
    expect(issuePasswordResetToken).not.toHaveBeenCalled();
  });

  it("returns the one-time link and scopes issuance to the admin's organization", async () => {
    const response = await resetLinkPost(emptyRequest(), params());
    const body = await response.json();
    expect(body.resetUrl).toContain("/reset-password/plain-token");
    expect(issuePasswordResetToken).toHaveBeenCalledWith({ userId: "u1", organizationId: "org1", actorId: "admin1" });
  });

  it("propagates the active-only restriction from the issuer", async () => {
    issuePasswordResetToken.mockRejectedValueOnce(new ApiError(409, "Only active employees can receive a password reset link"));
    const response = await resetLinkPost(emptyRequest(), params());
    expect(response.status).toBe(409);
  });

  it("propagates a cross-organization id as a 404", async () => {
    issuePasswordResetToken.mockRejectedValueOnce(new ApiError(404, "Employee not found"));
    expect((await resetLinkPost(emptyRequest(), params())).status).toBe(404);
  });

  it("rate limits per admin", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false });
    const response = await resetLinkPost(emptyRequest(), params());
    expect(response.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith("accountAdminAction", "admin1");
    expect(issuePasswordResetToken).not.toHaveBeenCalled();
  });

  it("never returns a password hash or token hash", async () => {
    const response = await resetLinkPost(emptyRequest(), params());
    expect(await response.text()).not.toMatch(/passwordHash|tokenHash/);
  });
});

describe("POST /api/employees/[id]/setup-link", () => {
  it("requires ADMIN and is now rate limited per admin", async () => {
    await setupLinkPost(emptyRequest(), params());
    expect(requireSession).toHaveBeenCalledWith(["ADMIN"]);
    expect(checkRateLimit).toHaveBeenCalledWith("accountAdminAction", "admin1");
  });

  it("propagates the pending-only restriction from the issuer", async () => {
    issueAccountSetupToken.mockRejectedValueOnce(new ApiError(409, "Only pending employees can receive an account setup link"));
    expect((await setupLinkPost(emptyRequest(), params())).status).toBe(409);
  });

  it("stops at the rate limit before issuing", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false });
    expect((await setupLinkPost(emptyRequest(), params())).status).toBe(429);
    expect(issueAccountSetupToken).not.toHaveBeenCalled();
  });
});

describe("POST /api/employees/[id]/account-status", () => {
  it("requires ADMIN", async () => {
    await accountStatusPost(statusRequest({ action: "DISABLE" }), params());
    expect(requireSession).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("denies a non-admin before changing anything", async () => {
    requireSession.mockRejectedValueOnce(new ApiError(403, "Forbidden"));
    const response = await accountStatusPost(statusRequest({ action: "DISABLE" }), params());
    expect(response.status).toBe(403);
    expect(disableEmployeeAccount).not.toHaveBeenCalled();
  });

  it("disables through the lifecycle helper, organization-scoped", async () => {
    const response = await accountStatusPost(statusRequest({ action: "DISABLE" }), params());
    expect(response.status).toBe(200);
    expect(disableEmployeeAccount).toHaveBeenCalledWith({ employeeId: "u1", organizationId: "org1", actorId: "admin1" });
    expect(enableEmployeeAccount).not.toHaveBeenCalled();
  });

  it("enables through the lifecycle helper and reports the resulting status", async () => {
    enableEmployeeAccount.mockResolvedValueOnce({ id: "u1", status: "PENDING_SETUP" });
    const response = await accountStatusPost(statusRequest({ action: "ENABLE" }), params());
    await expect(response.json()).resolves.toEqual({ employee: { id: "u1", status: "PENDING_SETUP" } });
  });

  it("invalidates the cached employee list after a status change", async () => {
    await accountStatusPost(statusRequest({ action: "DISABLE" }), params());
    expect(invalidateCache).toHaveBeenCalledWith("employees:list:org1");
  });

  it("rejects an unknown action", async () => {
    const response = await accountStatusPost(statusRequest({ action: "DELETE" }), params());
    expect(response.status).toBe(400);
    expect(disableEmployeeAccount).not.toHaveBeenCalled();
  });

  it("propagates a cross-organization id as a 404", async () => {
    disableEmployeeAccount.mockRejectedValueOnce(new ApiError(404, "Employee not found"));
    expect((await accountStatusPost(statusRequest({ action: "DISABLE" }), params())).status).toBe(404);
  });

  it("rate limits per admin", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false });
    expect((await accountStatusPost(statusRequest({ action: "DISABLE" }), params())).status).toBe(429);
    expect(disableEmployeeAccount).not.toHaveBeenCalled();
  });
});
