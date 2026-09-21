import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
vi.mock("@/lib/demand-recommendations", () => ({ recomputeMatchesForProperty: vi.fn() }));
vi.mock("@/lib/property-share-alerts", () => ({ notifyAffectedCataloguesOfPropertyChange: vi.fn() }));
vi.mock("@/lib/property-rematch", () => ({ shouldRematchProperty: () => false }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/property-access", () => ({ fieldExecutiveHasPropertyAccess: vi.fn() }));
vi.mock("@/lib/property-detail-dto", () => ({ toFieldExecutivePropertyDTO: (p: unknown) => p }));
vi.mock("@/lib/validators", () => ({
  createPropertySchema: {
    parse: (b: Record<string, unknown>) => ({
      ...b,
      amenities: b.amenities ?? [],
      suitableForTags: b.suitableForTags ?? [],
      images: b.images ?? [],
      hasOpenParking: b.hasOpenParking ?? false,
      hasStiltParking: b.hasStiltParking ?? false,
    }),
  },
  propertySchema: { partial: () => ({ parse: (b: unknown) => b }) },
}));

const resolveOrCreatePropertyLocality = vi.fn();
vi.mock("@/lib/property-locality", () => ({ resolveOrCreatePropertyLocality: (...a: unknown[]) => resolveOrCreatePropertyLocality(...a) }));

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
  resolveOrCreatePropertyLocality.mockResolvedValue("loc1");
  propertyCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "prop1", updatedAt: new Date(), ...data }));
});

/**
 * OPEN and STILT parking are independently selectable checkboxes. The
 * legacy `parkingAvailable` boolean (every existing matching/catalogue
 * reader) is never trusted directly from the client - it is always
 * server-derived as hasOpenParking || hasStiltParking, so create/edit never
 * lets the two get out of sync.
 */
describe("POST /api/properties - OPEN/STILT parking selections", () => {
  it.each([
    [true, true, true],
    [true, false, true],
    [false, true, true],
    [false, false, false],
  ])("hasOpenParking=%s hasStiltParking=%s -> parkingAvailable=%s", async (hasOpenParking, hasStiltParking, expected) => {
    const res = await POST(createReq({ title: "2BHK", area: "Mansarovar Garden", hasOpenParking, hasStiltParking }));
    expect(res.status).toBe(201);
    const data = propertyCreate.mock.calls[0][0].data;
    expect(data.hasOpenParking).toBe(hasOpenParking);
    expect(data.hasStiltParking).toBe(hasStiltParking);
    expect(data.parkingAvailable).toBe(expected);
  });
});

describe("PATCH /api/properties/[id] - OPEN/STILT parking selections", () => {
  beforeEach(() => {
    propertyUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "p1", updatedAt: new Date(), ...data }));
  });

  it("re-derives parkingAvailable when both flags are edited together (reopen -> edit -> save round trip)", async () => {
    propertyFindFirst.mockResolvedValue({ id: "p1", area: "Kirti Nagar", status: "AVAILABLE", hasOpenParking: false, hasStiltParking: false, parkingAvailable: false });
    const res = await PATCH(patchReq({ hasOpenParking: true, hasStiltParking: true }), params("p1"));
    expect(res.status).toBe(200);
    const data = propertyUpdate.mock.calls[0][0].data;
    expect(data.hasOpenParking).toBe(true);
    expect(data.hasStiltParking).toBe(true);
    expect(data.parkingAvailable).toBe(true);
  });

  it("unchecking both parking types clears the legacy parkingAvailable flag too", async () => {
    propertyFindFirst.mockResolvedValue({ id: "p1", area: "Kirti Nagar", status: "AVAILABLE", hasOpenParking: true, hasStiltParking: true, parkingAvailable: true });
    const res = await PATCH(patchReq({ hasOpenParking: false, hasStiltParking: false }), params("p1"));
    expect(res.status).toBe(200);
    expect(propertyUpdate.mock.calls[0][0].data.parkingAvailable).toBe(false);
  });

  it("falls back to the existing stored value for a parking field not included in a partial PATCH", async () => {
    // Existing property already has stilt parking; this PATCH only turns on open parking.
    propertyFindFirst.mockResolvedValue({ id: "p1", area: "Kirti Nagar", status: "AVAILABLE", hasOpenParking: false, hasStiltParking: true, parkingAvailable: true });
    const res = await PATCH(patchReq({ hasOpenParking: true }), params("p1"));
    expect(res.status).toBe(200);
    const data = propertyUpdate.mock.calls[0][0].data;
    expect(data.hasOpenParking).toBe(true);
    // hasStiltParking itself wasn't in this partial PATCH, so it's not part of the update...
    expect(data).not.toHaveProperty("hasStiltParking");
    // ...but parkingAvailable is still correctly re-derived using the existing stilt value.
    expect(data.parkingAvailable).toBe(true);
  });

  it("never touches parkingAvailable when a PATCH doesn't mention either parking field", async () => {
    propertyFindFirst.mockResolvedValue({ id: "p1", area: "Kirti Nagar", status: "AVAILABLE", hasOpenParking: true, hasStiltParking: false, parkingAvailable: true });
    const res = await PATCH(patchReq({ title: "Renamed" }), params("p1"));
    expect(res.status).toBe(200);
    expect(propertyUpdate.mock.calls[0][0].data).not.toHaveProperty("parkingAvailable");
  });
});
