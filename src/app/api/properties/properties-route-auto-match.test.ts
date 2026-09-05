import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Feature 1 (daily-ops hardening): a freshly created or materially edited
// property should have its PropertyRecommendation candidates (the Matched
// Customers panel's real data source) populated automatically, without a
// broker having to remember to click [Recalculate Matches]. These tests
// exercise the route-level wiring: recomputeMatchesForProperty is called on
// create and on a material update, a recompute failure never fails the
// property write, and no WhatsApp/provider send is ever triggered from this
// path (ZERO AUTO-SEND).
// ---------------------------------------------------------------------------

const propertyCreate = vi.fn();
const propertyCount = vi.fn();
const propertyFindFirst = vi.fn();
const propertyUpdate = vi.fn();

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
    requireSession: async () => ({ user: { id: "admin1", role: "ADMIN" } }),
    handleApiError: (err: { status?: number; message: string }) => NextResponse.json({ error: err.message }, { status: err.status ?? 500 }),
  };
});

vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));
vi.mock("@/lib/property-timeline", () => ({ appendPropertyTimelineEvent: vi.fn() }));
vi.mock("@/lib/match-recommendations", () => ({ recommendPropertyToWaitingLeads: vi.fn() }));
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

const recomputeMatchesForProperty = vi.fn();
vi.mock("@/lib/demand-recommendations", () => ({ recomputeMatchesForProperty: (...a: unknown[]) => recomputeMatchesForProperty(...a) }));

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
  propertyCount.mockResolvedValue(0);
  propertyCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "prop1", updatedAt: new Date(), ...data }));
  recomputeMatchesForProperty.mockResolvedValue({ created: 2, updated: 0 });
});

describe("POST /api/properties - automatic match recompute (Feature 1)", () => {
  it("calls recomputeMatchesForProperty for the new property after it is saved", async () => {
    const res = await POST(createReq({ title: "2BHK", area: "Kirti Nagar", listingType: "RENT", assetClass: "RESIDENTIAL" }));
    expect(res.status).toBe(201);
    expect(recomputeMatchesForProperty).toHaveBeenCalledWith("prop1", "org_default");
  });

  it("still returns 201 with the created property when recompute throws", async () => {
    recomputeMatchesForProperty.mockRejectedValue(new Error("boom"));
    const res = await POST(createReq({ title: "2BHK", area: "Kirti Nagar" }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.property.id).toBe("prop1");
    expect(logger.error).toHaveBeenCalledWith("property_recommendation_recompute_failed", expect.objectContaining({ propertyId: "prop1", stage: "create" }));
  });
});

describe("PATCH /api/properties/[id] - automatic match recompute (Feature 1)", () => {
  beforeEach(() => {
    propertyFindFirst.mockResolvedValue({ id: "p1", area: "Kirti Nagar", status: "AVAILABLE", monthlyRent: 30000 });
    propertyUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "p1", updatedAt: new Date(), ...data }));
  });

  it("recomputes matches when the edit is material (shouldRematchProperty=true)", async () => {
    shouldRematchProperty.mockReturnValue(true);
    const res = await PATCH(patchReq({ monthlyRent: 35000 }), params("p1"));
    expect(res.status).toBe(200);
    expect(recomputeMatchesForProperty).toHaveBeenCalledWith("p1", "org_default");
  });

  it("skips recompute for a non-material edit (shouldRematchProperty=false)", async () => {
    shouldRematchProperty.mockReturnValue(false);
    const res = await PATCH(patchReq({ title: "Renamed" }), params("p1"));
    expect(res.status).toBe(200);
    expect(recomputeMatchesForProperty).not.toHaveBeenCalled();
  });

  it("still returns 200 with the updated property when recompute throws", async () => {
    shouldRematchProperty.mockReturnValue(true);
    recomputeMatchesForProperty.mockRejectedValue(new Error("boom"));
    const res = await PATCH(patchReq({ monthlyRent: 35000 }), params("p1"));
    expect(res.status).toBe(200);
    expect(logger.error).toHaveBeenCalledWith("property_recommendation_recompute_failed", expect.objectContaining({ propertyId: "p1", stage: "update" }));
  });
});
