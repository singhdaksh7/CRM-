import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

const inspectPasswordResetToken = vi.fn();
const completePasswordReset = vi.fn();
const checkRateLimit = vi.fn();
const INVALID = "This password reset link is invalid or has expired";

vi.mock("@/lib/password-reset", () => ({
  inspectPasswordResetToken,
  completePasswordReset,
  INVALID_RESET_TOKEN_MESSAGE: INVALID,
}));
vi.mock("@/lib/api-auth", () => ({
  ApiError,
  handleApiError: (error: { status?: number; message: string; issues?: unknown }) =>
    error instanceof ApiError
      ? Response.json({ error: error.message }, { status: error.status })
      : Response.json({ error: "Validation failed" }, { status: 400 }),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit,
  clientIp: () => "203.0.113.5",
  rateLimitResponse: () => Response.json({ error: "Too many requests" }, { status: 429 }),
}));

const { GET, POST } = await import("./route");

const params = { params: Promise.resolve({ token: "the-token" }) };
function postRequest(body: unknown) {
  return new Request("http://localhost/api/password-reset/the-token", { method: "POST", body: JSON.stringify(body) }) as never;
}
const getRequest = new Request("http://localhost/api/password-reset/the-token") as never;

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimit.mockResolvedValue({ allowed: true });
});

describe("GET /api/password-reset/[token]", () => {
  it("returns the first name for a live token and nothing else", async () => {
    inspectPasswordResetToken.mockResolvedValue({ firstName: "Sagar", expiresAt: new Date("2026-08-17T10:45:00Z") });
    const response = await GET(getRequest, { params: Promise.resolve({ token: "the-token" }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.firstName).toBe("Sagar");
    expect(JSON.stringify(body)).not.toMatch(/tokenHash|passwordHash|email/);
  });

  it("returns the generic error for any invalid token", async () => {
    inspectPasswordResetToken.mockResolvedValue(null);
    const response = await GET(getRequest, { params: Promise.resolve({ token: "the-token" }) });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: INVALID });
  });

  it("rate limits validation so the token space can't be searched", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false });
    const response = await GET(getRequest, { params: Promise.resolve({ token: "the-token" }) });
    expect(response.status).toBe(429);
    expect(inspectPasswordResetToken).not.toHaveBeenCalled();
    expect(checkRateLimit).toHaveBeenCalledWith("passwordReset", "203.0.113.5");
  });
});

describe("POST /api/password-reset/[token]", () => {
  it("completes a valid reset", async () => {
    completePasswordReset.mockResolvedValue({ userId: "u1" });
    const response = await POST(postRequest({ password: "brand-new-password", confirmPassword: "brand-new-password" }), params);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(completePasswordReset).toHaveBeenCalledWith("the-token", "brand-new-password");
  });

  it.each([
    ["too short", "short1", "short1"],
    ["mismatched", "brand-new-password", "different-password"],
    ["whitespace only", "          ", "          "],
    ["over 128 chars", "x".repeat(129), "x".repeat(129)],
  ])("rejects a %s password without touching the token", async (_label, password, confirmPassword) => {
    const response = await POST(postRequest({ password, confirmPassword }), params);
    expect(response.status).toBe(400);
    expect(completePasswordReset).not.toHaveBeenCalled();
  });

  it("surfaces a rejected token as the generic error", async () => {
    completePasswordReset.mockRejectedValue(new ApiError(400, INVALID));
    const response = await POST(postRequest({ password: "brand-new-password", confirmPassword: "brand-new-password" }), params);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: INVALID });
  });

  it("rate limits submission", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false });
    const response = await POST(postRequest({ password: "brand-new-password", confirmPassword: "brand-new-password" }), params);
    expect(response.status).toBe(429);
    expect(completePasswordReset).not.toHaveBeenCalled();
  });

  it("never echoes the submitted password back to the client", async () => {
    completePasswordReset.mockResolvedValue({ userId: "u1" });
    const response = await POST(postRequest({ password: "brand-new-password", confirmPassword: "brand-new-password" }), params);
    expect(await response.text()).not.toContain("brand-new-password");
  });
});
