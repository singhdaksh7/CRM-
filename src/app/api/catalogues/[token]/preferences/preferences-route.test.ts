import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const checkRateLimit = vi.fn(async () => ({ allowed: true, limit: 60, remaining: 59, resetSeconds: 60 }));
const upsert = vi.fn();
const getByToken = vi.fn();

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => (checkRateLimit as (...args: unknown[]) => unknown)(...a),
  clientIp: () => "1.2.3.4",
  rateLimitResponse: () => Response.json({ error: "Too many requests" }, { status: 429 }),
}));

vi.mock("@/lib/catalogue-property-preferences", () => ({
  upsertCataloguePropertyPreference: (...a: unknown[]) => (upsert as (...args: unknown[]) => unknown)(...a),
  getCataloguePreferencesByToken: (...a: unknown[]) => (getByToken as (...args: unknown[]) => unknown)(...a),
}));

vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return {
    ApiError,
    handleApiError: (err: unknown) => {
      if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err && typeof err === "object" && "name" in err && (err as { name: string }).name === "ZodError") {
        return NextResponse.json({ error: "Validation failed" }, { status: 400 });
      }
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    },
  };
});

const { POST, GET } = await import("./route");

function post(body: unknown, token = "tok") {
  return POST(new NextRequest(new Request("https://x.test/api/catalogues/tok/preferences", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } })), {
    params: Promise.resolve({ token }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimit.mockResolvedValue({ allowed: true, limit: 60, remaining: 59, resetSeconds: 60 });
  upsert.mockResolvedValue({ id: "pref1", status: "LIKED" });
  getByToken.mockResolvedValue({ catalogueShareId: "cat1", preferences: [] });
});

describe("POST /api/catalogues/[token]/preferences security", () => {
  it("rejects organizationId from the browser", async () => {
    const res = await post({ propertyId: "p1", status: "LIKED", organizationId: "evil-org" });
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects leadId from the browser", async () => {
    const res = await post({ propertyId: "p1", status: "LIKED", leadId: "evil-lead" });
    expect(res.status).toBe(400);
  });

  it("upserts liked preference with token only", async () => {
    const res = await post({ propertyId: "p1", status: "LIKED" });
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ token: "tok", propertyId: "p1", status: "LIKED" }));
  });

  it("rate limits public preference posts", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false, limit: 60, remaining: 0, resetSeconds: 30 });
    const res = await post({ propertyId: "p1", status: "LIKED" });
    expect(res.status).toBe(429);
  });

  it("GET returns preferences for a token", async () => {
    const res = await GET(new NextRequest(new Request("https://x.test/api/catalogues/tok/preferences")), { params: Promise.resolve({ token: "tok" }) });
    expect(res.status).toBe(200);
    expect(getByToken).toHaveBeenCalledWith("tok");
  });
});
