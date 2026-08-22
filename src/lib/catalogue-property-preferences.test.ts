import { describe, it, expect, vi, beforeEach } from "vitest";

const catalogueShareFindUnique = vi.fn();
const catalogueShareUpdate = vi.fn();
const catalogueSharePropertyFindUnique = vi.fn();
const propertyFindFirst = vi.fn();
const preferenceUpsert = vi.fn();
const preferenceFindMany = vi.fn();
const catalogueShareFindFirst = vi.fn();
const leadFindFirst = vi.fn();
const logActivity = vi.fn();
const getCoverImageUrls = vi.fn(async () => ({}));

vi.mock("./prisma", () => ({
  prisma: {
    catalogueShare: {
      findUnique: (...a: unknown[]) => catalogueShareFindUnique(...a),
      findFirst: (...a: unknown[]) => catalogueShareFindFirst(...a),
      update: (...a: unknown[]) => catalogueShareUpdate(...a),
    },
    catalogueShareProperty: {
      findUnique: (...a: unknown[]) => catalogueSharePropertyFindUnique(...a),
    },
    property: { findFirst: (...a: unknown[]) => propertyFindFirst(...a) },
    cataloguePropertyPreference: {
      upsert: (...a: unknown[]) => preferenceUpsert(...a),
      findMany: (...a: unknown[]) => preferenceFindMany(...a),
    },
    lead: { findFirst: (...a: unknown[]) => leadFindFirst(...a) },
  },
}));

vi.mock("./api-auth", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("./activity", () => ({ logActivity: (...a: unknown[]) => (logActivity as (...args: unknown[]) => unknown)(...a) }));
vi.mock("./property-images", () => ({ getCoverImageUrls: (...a: unknown[]) => (getCoverImageUrls as (...args: unknown[]) => unknown)(...a) }));

const { upsertCataloguePropertyPreference, getCataloguePreferenceSummary, getLeadPropertyPreferences } = await import("./catalogue-property-preferences");
const { ApiError } = await import("./api-auth");

beforeEach(() => {
  vi.clearAllMocks();
  catalogueShareFindUnique.mockResolvedValue({
    id: "cat1",
    organizationId: "org1",
    leadId: "lead1",
    status: "ACTIVE",
    expiresAt: null,
    title: "Options",
    lead: { id: "lead1", clientName: "Rahul" },
  });
  catalogueSharePropertyFindUnique.mockResolvedValue({ id: "csp1", removedAt: null });
  propertyFindFirst.mockResolvedValue({ id: "prop1", propertyCode: "PROP-1" });
  preferenceUpsert.mockResolvedValue({
    id: "pref1",
    catalogueShareId: "cat1",
    propertyId: "prop1",
    status: "LIKED",
    organizationId: "org1",
    leadId: "lead1",
  });
});

describe("upsertCataloguePropertyPreference", () => {
  it("likes a property in the catalogue", async () => {
    const pref = await upsertCataloguePropertyPreference({ token: "tok", propertyId: "prop1", status: "LIKED" });
    expect(pref.status).toBe("LIKED");
    expect(preferenceUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ organizationId: "org1", leadId: "lead1", status: "LIKED" }),
        update: expect.objectContaining({ status: "LIKED" }),
      })
    );
  });

  it("allows changing LIKED to NOT_INTERESTED", async () => {
    preferenceUpsert.mockResolvedValue({ id: "pref1", status: "NOT_INTERESTED" });
    const pref = await upsertCataloguePropertyPreference({ token: "tok", propertyId: "prop1", status: "NOT_INTERESTED" });
    expect(pref.status).toBe("NOT_INTERESTED");
  });

  it("is idempotent on upsert of the same status", async () => {
    await upsertCataloguePropertyPreference({ token: "tok", propertyId: "prop1", status: "LIKED" });
    await upsertCataloguePropertyPreference({ token: "tok", propertyId: "prop1", status: "LIKED" });
    expect(preferenceUpsert).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid token", async () => {
    catalogueShareFindUnique.mockResolvedValue(null);
    await expect(upsertCataloguePropertyPreference({ token: "bad", propertyId: "prop1", status: "LIKED" })).rejects.toThrow(ApiError);
  });

  it("rejects property not in catalogue", async () => {
    catalogueSharePropertyFindUnique.mockResolvedValue(null);
    await expect(upsertCataloguePropertyPreference({ token: "tok", propertyId: "foreign", status: "LIKED" })).rejects.toThrow(/not part of this catalogue/);
  });

  it("rejects cross-org property ids", async () => {
    propertyFindFirst.mockResolvedValue(null);
    await expect(upsertCataloguePropertyPreference({ token: "tok", propertyId: "other-org-prop", status: "LIKED" })).rejects.toThrow(/not part of this catalogue/);
  });

  it("derives organization from catalogue and never needs organizationId argument", async () => {
    await upsertCataloguePropertyPreference({ token: "tok", propertyId: "prop1", status: "LIKED" });
    const args = preferenceUpsert.mock.calls[0][0];
    expect(args.create.organizationId).toBe("org1");
  });
});

describe("getCataloguePreferenceSummary", () => {
  it("counts liked, not interested, and no response", async () => {
    catalogueShareFindFirst.mockResolvedValue({
      id: "cat1",
      title: "Options",
      properties: [{ propertyId: "p1" }, { propertyId: "p2" }, { propertyId: "p3" }, { propertyId: "p4" }, { propertyId: "p5" }],
    });
    preferenceFindMany.mockResolvedValue([
      { propertyId: "p1", status: "LIKED", respondedAt: new Date(), note: null, property: { id: "p1", propertyCode: "A", title: "A", area: "Noida", city: "Noida", listingType: "SALE", monthlyRent: null, salePrice: 1, bhk: 3, status: "AVAILABLE", coverImage: null } },
      { propertyId: "p2", status: "LIKED", respondedAt: new Date(), note: null, property: { id: "p2", propertyCode: "B", title: "B", area: "Noida", city: "Noida", listingType: "SALE", monthlyRent: null, salePrice: 1, bhk: 3, status: "AVAILABLE", coverImage: null } },
      { propertyId: "p3", status: "LIKED", respondedAt: new Date(), note: null, property: { id: "p3", propertyCode: "C", title: "C", area: "Noida", city: "Noida", listingType: "SALE", monthlyRent: null, salePrice: 1, bhk: 3, status: "SOLD", coverImage: null } },
      { propertyId: "p4", status: "NOT_INTERESTED", respondedAt: new Date(), note: null, property: { id: "p4", propertyCode: "D", title: "D", area: "Noida", city: "Noida", listingType: "SALE", monthlyRent: null, salePrice: 1, bhk: 2, status: "AVAILABLE", coverImage: null } },
    ]);

    const summary = await getCataloguePreferenceSummary("cat1", "org1");
    expect(summary.totalProperties).toBe(5);
    expect(summary.likedCount).toBe(3);
    expect(summary.notInterestedCount).toBe(1);
    expect(summary.noResponseCount).toBe(1);
    expect(summary.liked.find((p) => p.propertyId === "p3")?.available).toBe(false);
  });
});

describe("getLeadPropertyPreferences - historical retention", () => {
  it("retains preferences for unavailable properties", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead1" });
    preferenceFindMany.mockResolvedValue([
      {
        propertyId: "p1",
        status: "LIKED",
        respondedAt: new Date(),
        note: null,
        property: { id: "p1", propertyCode: "A", title: "A", area: "Noida", city: "Noida", listingType: "SALE", monthlyRent: null, salePrice: 1, bhk: 3, status: "SOLD", coverImage: null },
        catalogueShare: { id: "cat1", title: "Options", token: "tok" },
      },
    ]);
    const result = await getLeadPropertyPreferences("lead1", "org1");
    expect(result.liked).toHaveLength(1);
    expect(result.liked[0].available).toBe(false);
  });
});
