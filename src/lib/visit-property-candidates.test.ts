import { describe, it, expect, vi, beforeEach } from "vitest";

const leadFindFirst = vi.fn();
const preferenceFindMany = vi.fn();
const catalogueShareFindMany = vi.fn();
const propertyFindMany = vi.fn();
const getCoverImageUrls = vi.fn(async () => ({}));

vi.mock("./prisma", () => ({
  prisma: {
    lead: { findFirst: (...a: unknown[]) => leadFindFirst(...a) },
    cataloguePropertyPreference: { findMany: (...a: unknown[]) => preferenceFindMany(...a) },
    catalogueShare: { findMany: (...a: unknown[]) => catalogueShareFindMany(...a) },
    property: { findMany: (...a: unknown[]) => propertyFindMany(...a) },
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

vi.mock("./property-images", () => ({ getCoverImageUrls: (...a: unknown[]) => (getCoverImageUrls as (...args: unknown[]) => unknown)(...a) }));

const { getVisitPropertyCandidates } = await import("./visit-property-candidates");

beforeEach(() => {
  vi.clearAllMocks();
  leadFindFirst.mockResolvedValue({ id: "lead1" });
  preferenceFindMany.mockResolvedValue([]);
  catalogueShareFindMany.mockResolvedValue([]);
  propertyFindMany.mockResolvedValue([]);
});

describe("getVisitPropertyCandidates", () => {
  it("groups liked, shared, and manual available properties with org isolation", async () => {
    preferenceFindMany
      .mockResolvedValueOnce([
        {
          propertyId: "liked1",
          status: "LIKED",
          property: {
            id: "liked1",
            propertyCode: "L1",
            title: "Liked Flat",
            area: "Noida",
            city: "Noida",
            listingType: "SALE",
            monthlyRent: null,
            salePrice: 100,
            bhk: 3,
            status: "AVAILABLE",
            coverImage: null,
          },
          catalogueShare: { id: "cat1", title: "Shared Options" },
        },
        {
          propertyId: "liked-gone",
          status: "LIKED",
          property: {
            id: "liked-gone",
            propertyCode: "L2",
            title: "Sold Liked",
            area: "Noida",
            city: "Noida",
            listingType: "SALE",
            monthlyRent: null,
            salePrice: 100,
            bhk: 2,
            status: "SOLD",
            coverImage: null,
          },
          catalogueShare: { id: "cat1", title: "Shared Options" },
        },
      ])
      .mockResolvedValueOnce([
        { propertyId: "liked1", status: "LIKED", respondedAt: new Date() },
        { propertyId: "liked-gone", status: "LIKED", respondedAt: new Date() },
      ]);

    catalogueShareFindMany.mockResolvedValue([
      {
        id: "cat1",
        title: "Shared Options",
        properties: [
          {
            propertyId: "liked1",
            property: {
              id: "liked1",
              propertyCode: "L1",
              title: "Liked Flat",
              area: "Noida",
              city: "Noida",
              listingType: "SALE",
              monthlyRent: null,
              salePrice: 100,
              bhk: 3,
              status: "AVAILABLE",
              coverImage: null,
            },
          },
          {
            propertyId: "shared1",
            property: {
              id: "shared1",
              propertyCode: "S1",
              title: "Shared Only",
              area: "Noida",
              city: "Noida",
              listingType: "SALE",
              monthlyRent: null,
              salePrice: 90,
              bhk: 2,
              status: "AVAILABLE",
              coverImage: null,
            },
          },
        ],
      },
    ]);

    propertyFindMany.mockResolvedValue([
      {
        id: "manual1",
        propertyCode: "M1",
        title: "Manual Available",
        area: "Dwarka",
        city: "Delhi",
        listingType: "RENT",
        monthlyRent: 30000,
        salePrice: null,
        bhk: 2,
        status: "AVAILABLE",
        coverImage: null,
      },
      {
        id: "liked1",
        propertyCode: "L1",
        title: "Liked Flat",
        area: "Noida",
        city: "Noida",
        listingType: "SALE",
        monthlyRent: null,
        salePrice: 100,
        bhk: 3,
        status: "AVAILABLE",
        coverImage: null,
      },
    ]);

    const result = await getVisitPropertyCandidates("lead1", "org1");
    expect(leadFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "lead1", organizationId: "org1" } }));
    expect(result.liked.map((c) => c.propertyId)).toEqual(["liked1", "liked-gone"]);
    expect(result.liked.find((c) => c.propertyId === "liked-gone")?.available).toBe(false);
    expect(result.shared.map((c) => c.propertyId)).toEqual(["shared1"]);
    expect(result.manual.map((c) => c.propertyId)).toEqual(["manual1"]);
  });
});
