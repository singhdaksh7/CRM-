import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const recordPasswordResetRequest = vi.fn();
const checkRateLimit = vi.fn();
vi.mock("@/lib/password-reset", () => ({ recordPasswordResetRequest }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit,
  clientIp: () => "203.0.113.5",
  rateLimitResponse: () => Response.json({ error: "Too many requests" }, { status: 429 }),
}));

const { POST } = await import("./route");

const GENERIC = "If an account exists for this email, password reset instructions are available.";

function request(body: unknown) {
  return new Request("http://localhost/api/forgot-password", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimit.mockResolvedValue({ allowed: true });
  recordPasswordResetRequest.mockResolvedValue(undefined);
});

describe("POST /api/forgot-password", () => {
  it("returns the exact generic message for a known account", async () => {
    const response = await POST(request({ email: "known@example.com" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: GENERIC });
  });

  it("returns a byte-identical response for an unknown account - no enumeration", async () => {
    const known = await POST(request({ email: "known@example.com" }));
    const unknown = await POST(request({ email: "nobody@example.com" }));
    expect(unknown.status).toBe(known.status);
    expect(await unknown.text()).toBe(await known.text());
  });

  it("answers generically even when the request body is unparseable", async () => {
    const response = await POST(request("}{not json"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: GENERIC });
  });

  it("answers generically for a malformed email rather than returning a 400", async () => {
    const response = await POST(request({ email: "" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: GENERIC });
  });

  it("never leaks role, status, organization or user id", async () => {
    const response = await POST(request({ email: "known@example.com" }));
    const body = await response.text();
    expect(body).not.toMatch(/ADMIN|FIELD_EXECUTIVE|ACTIVE|INACTIVE|PENDING_SETUP|organizationId|userId/);
  });

  it("rate limits by client IP before doing any lookup", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false });
    const response = await POST(request({ email: "known@example.com" }));
    expect(response.status).toBe(429);
    expect(recordPasswordResetRequest).not.toHaveBeenCalled();
    expect(checkRateLimit).toHaveBeenCalledWith("forgotPassword", "203.0.113.5");
  });

  it("passes the submitted email through to the recorder", async () => {
    await POST(request({ email: "  Known@Example.com " }));
    expect(recordPasswordResetRequest).toHaveBeenCalledWith("Known@Example.com");
  });
});
