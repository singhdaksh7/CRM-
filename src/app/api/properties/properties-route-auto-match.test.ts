import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Property writes retain the lead-facing recommendation trigger while the
// retired Demand Pool customer recommendation trigger stays disconnected.
// ---------------------------------------------------------------------------

const propertyCreate = vi.fn();
const propertyCount = vi.fn();
const propertyFindFirst = vi.fn();
const propertyUpdate = vi.fn();
const requireSession = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    property: {
      create: (...a: unknown[]) => propertyCreate(...a),
      count: (...a: unknown[]) => propertyCount(...a),
      findFirst: (...a: unknown[]) => propertyFindFirst(...a),
      update: (...a: unknown[]) => propertyUpdate(...a),
    },
  },
}));

vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    ApiError: class ApiError extends Error {
      status: number;
      constructor(status: number, message: string) {
        super(message);
        this.status = status;
      }
    },
    requireSession: (...args: unknown[]) => requireSession(...args),
    handleApiError: (err: { status?: number; message: string }) => NextResponse.json({ error: err.message }, { status: err.status ?? 500 }),
  };
});

vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));
vi.mock("@/lib/property-timeline", () => ({ appendPropertyTimelineEvent: vi.fn() }));
const recommendPropertyToWaitingLeads = vi.fn();
vi.mock("@/lib/match-recommendations", () => ({ recommendPropertyToWaitingLeads }));
vi.mock("@/lib/property-share-alerts", () => ({ notifyAffectedCataloguesOfPropertyChange: vi.fn() }));
vi.mock("@/lib/property-access", () => ({ fieldExecutiveHasPropertyAccess: vi.fn() }));
vi.mock("@/lib/property-detail-dto", () => ({ toFieldExecutivePropertyDTO: (p: unknown) => p }));
vi.mock("@/lib/validators", () => ({
  createPropertySchema: { parse: (b: Record<string, unknown>) => ({ ...b, amenities: b.amenities ?? [], suitableForTags: b.suitableForTags ?? [], images: b.images ?? [] }) },
  propertySchema: { partial: () => ({ parse: (b: unknown) => b }) },
}));
vi.mock("@/lib/property-locality", () => ({ resolveOrCreatePropertyLocality: vi.fn().mockResolvedValue("loc1") }));

const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
vi.mock("@/lib/logger", () => ({ logger }));

const shouldRematchProperty = vi.fn();
vi.mock("@/lib/property-rematch", () => ({ shouldRematchProperty: (...a: unknown[]) => shouldRematchProperty(...a) }));

const { POST } = await import("./route");
const { PATCH } = await import("./[id]/route");

function createReq(body: Record<string, unknown>) {
  return new NextRequest(new Request("https://x.test/api/properties", { method: "POST", body: JSON.stringify(body) }));
}
function patchReq(body: Record<string, unknown>) {
  return new NextRequest(new Request("https://x.test/api/properties/p1", { method: "PATCH", body: JSON.stringify(body) }));
}
function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: "admin1", role: "ADMIN" } });
  propertyCount.mockResolvedValue(0);
  propertyCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "prop1", updatedAt: new Date(), ...data }));
});

describe("POST /api/properties - lead matching trigger", () => {
  it.each(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"])("allows %s to create a property", async (role) => {
    requireSession.mockResolvedValueOnce({ user: { id: "creator-1", role } });

    const res = await POST(createReq({ title: "2BHK", area: "Kirti Nagar" }));

    expect(res.status).toBe(201);
    expect(requireSession).toHaveBeenCalledWith(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]);
  });

  it("takes organizationId and createdById from the session, ignoring a malicious payload value", async () => {
    const res = await POST(createReq({ title: "2BHK", area: "Kirti Nagar", organizationId: "other-org", createdById: "other-user" }));

    expect(res.status).toBe(201);
    expect(propertyCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: "org_default", createdById: "admin1" }) }));
  });

  it("does not create a property when the caller is unauthenticated", async () => {
    requireSession.mockRejectedValueOnce(Object.assign(new Error("Unauthorized"), { status: 401 }));

    const res = await POST(createReq({ title: "2BHK", area: "Kirti Nagar" }));

    expect(res.status).toBe(401);
    expect(propertyCreate).not.toHaveBeenCalled();
  });

  it("keeps the lead-facing recommendation trigger after save", async () => {
    const res = await POST(createReq({ title: "2BHK", area: "Kirti Nagar", listingType: "RENT", assetClass: "RESIDENTIAL" }));
    expect(res.status).toBe(201);
    expect(recommendPropertyToWaitingLeads).toHaveBeenCalledWith("prop1", expect.stringContaining("created:prop1:"));
  });
});

describe("PATCH /api/properties/[id] - automatic match recompute (Feature 1)", () => {
  beforeEach(() => {
    propertyFindFirst.mockResolvedValue({ id: "p1", area: "Kirti Nagar", status: "AVAILABLE", monthlyRent: 30000 });
    propertyUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "p1", updatedAt: new Date(), ...data }));
  });

  it("keeps the lead-facing recommendation trigger for a material edit", async () => {
    shouldRematchProperty.mockReturnValue(true);
    const res = await PATCH(patchReq({ monthlyRent: 35000 }), params("p1"));
    expect(res.status).toBe(200);
    expect(recommendPropertyToWaitingLeads).toHaveBeenCalledWith("p1", expect.stringContaining("property:p1:"));
  });

  it("skips lead matching for a non-material edit (shouldRematchProperty=false)", async () => {
    shouldRematchProperty.mockReturnValue(false);
    const res = await PATCH(patchReq({ title: "Renamed" }), params("p1"));
    expect(res.status).toBe(200);
    expect(recommendPropertyToWaitingLeads).not.toHaveBeenCalled();
  });
});
