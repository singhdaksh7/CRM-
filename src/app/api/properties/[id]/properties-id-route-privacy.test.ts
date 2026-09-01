import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const propertyFindFirst = vi.fn();
const visitFindFirst = vi.fn();
const catalogueSharePropertyFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    property: { findFirst: (...a: unknown[]) => propertyFindFirst(...a) },
    visit: { findFirst: (...a: unknown[]) => visitFindFirst(...a) },
    catalogueShareProperty: { findFirst: (...a: unknown[]) => catalogueSharePropertyFindFirst(...a) },
  },
}));

let sessionUser: { id: string; role: string; organizationId?: string } = { id: "admin1", role: "ADMIN" };

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
vi.mock("@/lib/validators", () => ({ propertySchema: { partial: () => ({ parse: (b: unknown) => b }) } }));
vi.mock("@/lib/property-share-alerts", () => ({ notifyAffectedCataloguesOfPropertyChange: vi.fn() }));
vi.mock("@/lib/property-timeline", () => ({ appendPropertyTimelineEvent: vi.fn() }));
vi.mock("@/lib/property-rematch", () => ({ shouldRematchProperty: () => false }));
vi.mock("@/lib/match-recommendations", () => ({ recommendPropertyToWaitingLeads: vi.fn() }));

const { GET } = await import("./route");

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req() {
  return new NextRequest(new Request("https://x.test/api/properties/p1"));
}

const DIRECT_PROPERTY = {
  id: "p1",
  organizationId: "org_default",
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
  ownerAlternatePhone: "+919111111112",
  ownerNotes: "Prefers calls after 6pm",
  partner: null,
  propertySource: "Referral",
  keyAvailability: "With owner",
  entryInstructions: "Ring bell twice",
  internalNotes: "Prefers evening visits",
  negotiationNotes: "Can go lower",
  hiddenRemarks: "Noisy road",
  lastVerifiedById: "user9",
  status: "AVAILABLE",
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: "admin1", role: "ADMIN" };
  propertyFindFirst.mockResolvedValue(DIRECT_PROPERTY);
});

describe("GET /api/properties/[id] - role-aware privacy (A1)", () => {
  it("returns 404 for a property outside the actor's organization (cross-org)", async () => {
    propertyFindFirst.mockResolvedValue(null);
    const res = await GET(req(), params("p1"));
    expect(res.status).toBe(404);
  });

  it("ADMIN receives the full unredacted property, unchanged", async () => {
    const res = await GET(req(), params("p1"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.property.internalNotes).toBe("Prefers evening visits");
    expect(body.property.negotiationNotes).toBe("Can go lower");
    expect(body.property.hiddenRemarks).toBe("Noisy road");
    expect(body.property.ownerPhone).toBe("+919111111111");
    expect(body.property.address).toBe("123 Main Street");
  });

  it("DATA_MANAGER receives the full unredacted property, unchanged", async () => {
    sessionUser = { id: "dm1", role: "DATA_MANAGER" };
    const res = await GET(req(), params("p1"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.property.internalNotes).toBe("Prefers evening visits");
    expect(body.property.ownerPhone).toBe("+919111111111");
  });

  it("an UNASSIGNED FIELD_EXECUTIVE gets the property (200), but with all sensitive fields redacted", async () => {
    sessionUser = { id: "fe1", role: "FIELD_EXECUTIVE" };
    visitFindFirst.mockResolvedValue(null);
    catalogueSharePropertyFindFirst.mockResolvedValue(null);

    const res = await GET(req(), params("p1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.property.internalNotes).toBeNull();
    expect(body.property.negotiationNotes).toBeNull();
    expect(body.property.hiddenRemarks).toBeNull();
    expect(body.property.address).toBeNull();
    expect(body.property.buildingName).toBeNull();
    expect(body.property.flatNumber).toBeNull();
    expect(body.property.gateNumber).toBeNull();
    expect(body.property.entryInstructions).toBeNull();
    expect(body.property.keyAvailability).toBeNull();
    expect(body.property.latitude).toBeNull();
    expect(body.property.longitude).toBeNull();
    expect(body.property.ownerName).toBeNull();
    expect(body.property.ownerPhone).toBeNull();
    expect(body.property.ownerAlternatePhone).toBeNull();
    expect(body.property.ownerNotes).toBeNull();
    expect(body.property.propertySource).toBeNull();
    expect(body.property.lastVerifiedById).toBeNull();
    // Non-sensitive fields still come through.
    expect(body.property.title).toBe("Spacious 2 BHK");
  });

  it("an ASSIGNED FIELD_EXECUTIVE (has a visit for this property) sees address/GPS/owner contact, never commercial notes", async () => {
    sessionUser = { id: "fe1", role: "FIELD_EXECUTIVE" };
    visitFindFirst.mockResolvedValue({ id: "visit1" });
    catalogueSharePropertyFindFirst.mockResolvedValue(null);

    const res = await GET(req(), params("p1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.property.address).toBe("123 Main Street");
    expect(body.property.buildingName).toBe("Sunrise Apartments");
    expect(body.property.latitude).toBe(28.6);
    expect(body.property.longitude).toBe(77.1);
    expect(body.property.ownerName).toBe("Ramesh Gupta");
    expect(body.property.ownerPhone).toBe("+919111111111");
    // Commercial terms stay hidden even for an assigned executive.
    expect(body.property.internalNotes).toBeNull();
    expect(body.property.negotiationNotes).toBeNull();
    expect(body.property.hiddenRemarks).toBeNull();
    // Never exposed to a FIELD_EXECUTIVE regardless of assignment.
    expect(body.property.ownerAlternatePhone).toBeNull();
    expect(body.property.ownerNotes).toBeNull();
  });

  it("a FIELD_EXECUTIVE assigned to a DIFFERENT property (no visit/catalogue match for THIS one) stays redacted", async () => {
    sessionUser = { id: "fe1", role: "FIELD_EXECUTIVE" };
    // Neither lookup matches propertyId p1 for this executive.
    visitFindFirst.mockResolvedValue(null);
    catalogueSharePropertyFindFirst.mockResolvedValue(null);

    const res = await GET(req(), params("p1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.property.address).toBeNull();
    expect(body.property.ownerPhone).toBeNull();

    // And the access check was correctly scoped to THIS property + this org.
    expect(visitFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: "org_default", assignedToId: "fe1" }) })
    );
  });

  it("exposes inventory partner contact (not owner) for an INDIRECT property when the executive is assigned", async () => {
    sessionUser = { id: "fe1", role: "FIELD_EXECUTIVE" };
    visitFindFirst.mockResolvedValue({ id: "visit1" });
    propertyFindFirst.mockResolvedValue({
      ...DIRECT_PROPERTY,
      inventorySource: "INDIRECT",
      ownerName: null,
      ownerPhone: null,
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
