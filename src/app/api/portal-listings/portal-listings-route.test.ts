import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const propertyFindFirst = vi.fn();
const portalListingFindFirst = vi.fn();
const portalListingCreate = vi.fn();
const connectionFindFirst = vi.fn();
const recordAudit = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    property: { findFirst: (...a: unknown[]) => propertyFindFirst(...a) },
    portalListing: {
      findFirst: (...a: unknown[]) => portalListingFindFirst(...a),
      create: (...a: unknown[]) => portalListingCreate(...a),
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
  return new NextRequest(new Request("https://x.test/api/portal-listings", { method: "POST", body: JSON.stringify(body) }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/portal-listings", () => {
  it("rejects an unknown provider", async () => {
    const res = await POST(req({ propertyId: "p1", provider: "NOT_A_PROVIDER" }));
    expect(res.status).toBe(400);
  });

  it("404s when the property doesn't exist in this org", async () => {
    propertyFindFirst.mockResolvedValue(null);
    const res = await POST(req({ propertyId: "p1", provider: "HOUSING" }));
    expect(res.status).toBe(404);
  });

  it("returns the existing listing instead of duplicating it", async () => {
    propertyFindFirst.mockResolvedValue({ id: "p1" });
    portalListingFindFirst.mockResolvedValue({ id: "l1", provider: "HOUSING", status: "DRAFT" });
    const res = await POST(req({ propertyId: "p1", provider: "HOUSING" }));
    expect(res.status).toBe(200);
    expect(portalListingCreate).not.toHaveBeenCalled();
  });

  it("creates a DRAFT distribution record with no external call", async () => {
    propertyFindFirst.mockResolvedValue({ id: "p1" });
    portalListingFindFirst.mockResolvedValue(null);
    connectionFindFirst.mockResolvedValue({ id: "c1" });
    portalListingCreate.mockResolvedValue({ id: "l1", provider: "HOUSING", status: "DRAFT" });
    const res = await POST(req({ propertyId: "p1", provider: "HOUSING" }));
    expect(res.status).toBe(201);
    expect(portalListingCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "DRAFT", connectionId: "c1" }) }));
    expect(recordAudit).toHaveBeenCalled();
  });
});
