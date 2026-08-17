import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const portalListingFindFirst = vi.fn();
const portalListingUpdate = vi.fn();
const connectionFindFirst = vi.fn();
const recordAudit = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    portalListing: {
      findFirst: (...a: unknown[]) => portalListingFindFirst(...a),
      update: (...a: unknown[]) => portalListingUpdate(...a),
    },
    propertyPortalConnection: { findFirst: (...a: unknown[]) => connectionFindFirst(...a) },
  },
}));

const { MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { MockApiError };
});

vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    ApiError: MockApiError,
    requireSession: async () => ({ user: { id: "admin1", role: "ADMIN" } }),
    handleApiError: (err: unknown) => {
      if (err instanceof MockApiError) return NextResponse.json({ error: err.message }, { status: err.status });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    },
  };
});

vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));

const { POST } = await import("./route");

function req(body: unknown) {
  return new NextRequest(new Request("https://x.test/api/portal-listings/l1/action", { method: "POST", body: JSON.stringify(body) }));
}
function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/portal-listings/[id]/action", () => {
  it("rejects an unknown action", async () => {
    const res = await POST(req({ action: "DELETE_FOREVER" }), params("l1"));
    expect(res.status).toBe(400);
  });

  it("404s when the listing doesn't exist in this org", async () => {
    portalListingFindFirst.mockResolvedValue(null);
    const res = await POST(req({ action: "PUBLISH" }), params("l1"));
    expect(res.status).toBe(404);
  });

  it("blocks publish with a truthful reason because every provider is contract-only (PARTNER_ACCESS_REQUIRED)", async () => {
    portalListingFindFirst.mockResolvedValue({ id: "l1", provider: "HOUSING", status: "DRAFT", connectionId: "c1" });
    connectionFindFirst.mockResolvedValue({ id: "c1", status: "CONNECTED" });
    const res = await POST(req({ action: "PUBLISH" }), params("l1"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.reason).toBe("PARTNER_ACCESS_REQUIRED");
    expect(portalListingUpdate).not.toHaveBeenCalled();
  });

  it("blocks update on a listing that was never published", async () => {
    portalListingFindFirst.mockResolvedValue({ id: "l1", provider: "HOUSING", status: "DRAFT", connectionId: null });
    const res = await POST(req({ action: "UPDATE" }), params("l1"));
    expect(res.status).toBe(409);
  });
});
