import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

const requireSession = vi.fn();
const checkRateLimit = vi.fn();
const changeOwnPassword = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireSession,
  ApiError,
  handleApiError: (error: { status?: number; message: string }) =>
    error instanceof ApiError
      ? Response.json({ error: error.message }, { status: error.status })
      : Response.json({ error: "Validation failed" }, { status: 400 }),
}));
vi.mock("@/lib/password-reset", () => ({ changeOwnPassword }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit,
  rateLimitResponse: () => Response.json({ error: "Too many requests" }, { status: 429 }),
}));

const { POST } = await import("./route");

const valid = { currentPassword: "old-password", password: "brand-new-password", confirmPassword: "brand-new-password" };
const request = (body: unknown) =>
  new Request("http://localhost/api/account/password", { method: "POST", body: JSON.stringify(body) }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: "u1", role: "FIELD_EXECUTIVE" } });
  checkRateLimit.mockResolvedValue({ allowed: true });
  changeOwnPassword.mockResolvedValue({ userId: "u1" });
});

describe("POST /api/account/password", () => {
  it("lets any signed-in role change their own password - no admin gate", async () => {
    const response = await POST(request(valid));
    expect(response.status).toBe(200);
    expect(requireSession).toHaveBeenCalledWith();
  });

  it("rejects an unauthenticated request", async () => {
    requireSession.mockRejectedValueOnce(new ApiError(401, "Unauthorized"));
    const response = await POST(request(valid));
    expect(response.status).toBe(401);
    expect(changeOwnPassword).not.toHaveBeenCalled();
  });

  it("takes the user id from the session, never from the body", async () => {
    await POST(request({ ...valid, userId: "someone-else" }));
    expect(changeOwnPassword).toHaveBeenCalledWith({
      userId: "u1",
      currentPassword: "old-password",
      newPassword: "brand-new-password",
    });
  });

  it("surfaces a wrong current password as a 400", async () => {
    changeOwnPassword.mockRejectedValueOnce(new ApiError(400, "Your current password is incorrect"));
    const response = await POST(request(valid));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Your current password is incorrect" });
  });

  it("surfaces a non-ACTIVE account as a 403", async () => {
    changeOwnPassword.mockRejectedValueOnce(new ApiError(403, "This account cannot change its password"));
    expect((await POST(request(valid))).status).toBe(403);
  });

  it.each([
    ["a missing current password", { ...valid, currentPassword: "" }],
    ["a too-short new password", { ...valid, password: "short1", confirmPassword: "short1" }],
    ["a mismatched confirmation", { ...valid, confirmPassword: "something-else" }],
    ["a whitespace-only new password", { ...valid, password: "         ", confirmPassword: "         " }],
    ["an over-long new password", { ...valid, password: "x".repeat(129), confirmPassword: "x".repeat(129) }],
  ])("rejects %s before touching the database", async (_label, body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(changeOwnPassword).not.toHaveBeenCalled();
  });

  it("rate limits per user", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false });
    const response = await POST(request(valid));
    expect(response.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith("passwordChange", "u1");
    expect(changeOwnPassword).not.toHaveBeenCalled();
  });

  it("never echoes either password back to the client", async () => {
    const response = await POST(request(valid));
    const body = await response.text();
    expect(body).not.toContain("old-password");
    expect(body).not.toContain("brand-new-password");
  });
});
