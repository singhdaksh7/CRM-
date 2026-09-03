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
vi.mock("@/lib/property-share-alerts", () => ({ notifyAffectedCataloguesOfPropertyChange: vi.fn() }));
vi.mock("@/lib/property-rematch", () => ({ shouldRematchProperty: () => false }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/property-access", () => ({ fieldExecutiveHasPropertyAccess: vi.fn() }));
vi.mock("@/lib/property-detail-dto", () => ({ toFieldExecutivePropertyDTO: (p: unknown) => p }));
vi.mock("@/lib/validators", () => ({
  createPropertySchema: { parse: (b: Record<string, unknown>) => ({ ...b, amenities: b.amenities ?? [], suitableForTags: b.suitableForTags ?? [], images: b.images ?? [] }) },
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

describe("POST /api/properties - locality wiring (A8)", () => {
  it("resolves/creates the locality from `area` and stamps localityId on the new property", async () => {
    const res = await POST(createReq({ title: "2BHK", area: "Mansarovar Garden" }));
    expect(res.status).toBe(201);
    expect(resolveOrCreatePropertyLocality).toHaveBeenCalledWith("org_default", "Mansarovar Garden", "admin1");
    expect(propertyCreate.mock.calls[0][0].data.localityId).toBe("loc1");
  });
});

describe("PATCH /api/properties/[id] - locality wiring (A8)", () => {
  beforeEach(() => {
    propertyFindFirst.mockResolvedValue({ id: "p1", area: "Kirti Nagar", status: "AVAILABLE" });
    propertyUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "p1", updatedAt: new Date(), ...data }));
  });

  it("re-resolves the locality when `area` actually changes", async () => {
    resolveOrCreatePropertyLocality.mockResolvedValue("loc-new");
    const res = await PATCH(patchReq({ area: "Basai Darapur" }), params("p1"));
    expect(res.status).toBe(200);
    expect(resolveOrCreatePropertyLocality).toHaveBeenCalledWith("org_default", "Basai Darapur", "admin1");
    expect(propertyUpdate.mock.calls[0][0].data.localityId).toBe("loc-new");
  });

  it("does not touch localityId when `area` is unchanged", async () => {
    const res = await PATCH(patchReq({ title: "Renamed" }), params("p1"));
    expect(res.status).toBe(200);
    expect(resolveOrCreatePropertyLocality).not.toHaveBeenCalled();
    expect(propertyUpdate.mock.calls[0][0].data).not.toHaveProperty("localityId");
  });

  it("does not re-resolve when the submitted area is identical to the existing one", async () => {
    const res = await PATCH(patchReq({ area: "Kirti Nagar" }), params("p1"));
    expect(res.status).toBe(200);
    expect(resolveOrCreatePropertyLocality).not.toHaveBeenCalled();
  });
});

/**
 * Regression for a release-blocking bug: editing a property (after
 * uploading images via the separate PropertyGallery flow, or on any plain
 * edit) always 500'd, because `suitableForTags` - unlike `amenities` and
 * `images`, both correctly JSON.stringify'd - was spread straight from the
 * parsed body into `prisma.property.update()`'s `data`, and the column is a
 * JSON-string-encoded `String`, not a native Postgres array. Prisma's
 * client-side validation rejected the raw array with "Invalid value
 * provided. Expected String... provided ()." Reproduced against a real
 * local Postgres + MinIO stack (not mocked) before this fix; these tests
 * assert the mocked call shape a real Prisma client would also require.
 */
describe("PATCH /api/properties/[id] - JSON-array field serialization", () => {
  beforeEach(() => {
    propertyFindFirst.mockResolvedValue({ id: "p1", area: "Kirti Nagar", status: "AVAILABLE" });
    propertyUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "p1", updatedAt: new Date(), ...data }));
  });

  it("JSON-stringifies suitableForTags before it reaches Prisma, same as amenities/images", async () => {
    const res = await PATCH(patchReq({ suitableForTags: ["FAMILY", "PET_FRIENDLY"], amenities: ["Lift"], images: [] }), params("p1"));
    expect(res.status).toBe(200);
    const data = propertyUpdate.mock.calls[0][0].data;
    expect(data.suitableForTags).toBe(JSON.stringify(["FAMILY", "PET_FRIENDLY"]));
    expect(data.amenities).toBe(JSON.stringify(["Lift"]));
    expect(data.images).toBe(JSON.stringify([]));
    expect(Array.isArray(data.suitableForTags)).toBe(false);
  });

  it("clears suitableForTags to an empty JSON array (not omitted) when submitted as []", async () => {
    const res = await PATCH(patchReq({ suitableForTags: [] }), params("p1"));
    expect(res.status).toBe(200);
    expect(propertyUpdate.mock.calls[0][0].data.suitableForTags).toBe("[]");
  });

  it("omits suitableForTags from the update entirely when not submitted", async () => {
    const res = await PATCH(patchReq({ title: "Renamed" }), params("p1"));
    expect(res.status).toBe(200);
    expect(propertyUpdate.mock.calls[0][0].data).not.toHaveProperty("suitableForTags");
  });
});
