import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const propertyFindFirst = vi.fn();
const visitFindFirst = vi.fn();
const catalogueSharePropertyFindFirst = vi.fn();
const propertyViewLogCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    property: { findFirst: (...a: unknown[]) => propertyFindFirst(...a) },
    visit: { findFirst: (...a: unknown[]) => visitFindFirst(...a) },
    catalogueShareProperty: { findFirst: (...a: unknown[]) => catalogueSharePropertyFindFirst(...a) },
    propertyViewLog: { create: (...a: unknown[]) => propertyViewLogCreate(...a) },
  },
}));

let sessionUser: { id: string; role: string } = { id: "admin1", role: "ADMIN" };

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
    requireSession: async (allowedRoles?: string[]) => {
      if (allowedRoles && !allowedRoles.includes(sessionUser.role)) throw new MockApiError(403, "Forbidden");
      return { user: sessionUser };
    },
    handleApiError: (err: unknown) => {
      if (err instanceof MockApiError) return NextResponse.json({ error: err.message }, { status: err.status });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    },
  };
});

vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const { GET } = await import("./route");

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req() {
  return new NextRequest(new Request("https://x.test/api/properties/p1/internal"));
}

const DIRECT_PROPERTY = {
  id: "p1",
  title: "Spacious 2 BHK",
  address: "123 Main Street",
  buildingName: "Sunrise Apartments",
  flatNumber: "301",
  gateNumber: "Gate 2",
  landmark: "Near Metro",
  latitude: 28.6,
  longitude: 77.1,
  inventorySource: "DIRECT",
  ownerName: "Ramesh Gupta",
  ownerPhone: "+919111111111",
  owner: { name: "Ramesh Gupta", phone: "+919111111111" },
  partner: null,
  propertySource: "Referral",
  keyAvailability: "With owner",
  entryInstructions: "Ring bell twice",
  internalNotes: "Prefers evening visits",
  negotiationNotes: "Can go lower",
  hiddenRemarks: "Noisy road",
  pendingVerification: false,
  lastVerifiedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: "admin1", role: "ADMIN" };
  propertyViewLogCreate.mockResolvedValue({});
});

describe("GET /api/properties/[id]/internal", () => {
  it("returns 404 when the property doesn't exist in this org", async () => {
    propertyFindFirst.mockResolvedValue(null);
    const res = await GET(req(), params("p1"));
    expect(res.status).toBe(404);
  });

  it("returns internal fields (address, keys, notes) for ADMIN", async () => {
    propertyFindFirst.mockResolvedValue(DIRECT_PROPERTY);
    const res = await GET(req(), params("p1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.property.exactAddress).toBe("123 Main Street");
    expect(body.property.buildingName).toBe("Sunrise Apartments");
    expect(body.property.internalNotes).toBe("Prefers evening visits");
    expect(body.property.ownerName).toBe("Ramesh Gupta");
  });

  it("writes a fire-and-forget PropertyViewLog row", async () => {
    propertyFindFirst.mockResolvedValue(DIRECT_PROPERTY);
    await GET(req(), params("p1"));
    expect(propertyViewLogCreate).toHaveBeenCalledWith({ data: { userId: "admin1", propertyId: "p1" } });
  });

  it("denies a FIELD_EXECUTIVE with no assigned visit or lead match with 403", async () => {
    sessionUser = { id: "fe1", role: "FIELD_EXECUTIVE" };
    propertyFindFirst.mockResolvedValue(DIRECT_PROPERTY);
    visitFindFirst.mockResolvedValue(null);
    catalogueSharePropertyFindFirst.mockResolvedValue(null);
    const res = await GET(req(), params("p1"));
    expect(res.status).toBe(403);
  });

  it("allows a FIELD_EXECUTIVE with an assigned visit for this property", async () => {
    sessionUser = { id: "fe1", role: "FIELD_EXECUTIVE" };
    propertyFindFirst.mockResolvedValue(DIRECT_PROPERTY);
    visitFindFirst.mockResolvedValue({ id: "v1" });
    catalogueSharePropertyFindFirst.mockResolvedValue(null);
    const res = await GET(req(), params("p1"));
    expect(res.status).toBe(200);
  });

  it("allows a FIELD_EXECUTIVE via a catalogue for one of their assigned leads", async () => {
    sessionUser = { id: "fe1", role: "FIELD_EXECUTIVE" };
    propertyFindFirst.mockResolvedValue(DIRECT_PROPERTY);
    visitFindFirst.mockResolvedValue(null);
    catalogueSharePropertyFindFirst.mockResolvedValue({ id: "csp1" });
    const res = await GET(req(), params("p1"));
    expect(res.status).toBe(200);
  });

  it("exposes inventory partner contact for an INDIRECT property, never owner fields", async () => {
    propertyFindFirst.mockResolvedValue({
      ...DIRECT_PROPERTY,
      inventorySource: "INDIRECT",
      ownerName: null,
      ownerPhone: null,
      owner: null,
      partner: { name: "Sharma Dealers", phone: "+919222222222" },
    });
    const res = await GET(req(), params("p1"));
    const body = await res.json();
    expect(body.property.partnerName).toBe("Sharma Dealers");
    expect(body.property.partnerPhone).toBe("+919222222222");
    expect(body.property.ownerName).toBeNull();
    expect(body.property.ownerPhone).toBeNull();
  });
});
