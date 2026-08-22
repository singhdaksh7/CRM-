import { describe, it, expect, vi, beforeEach } from "vitest";

const propertyFindMany = vi.fn();
const getCoverImageUrls = vi.fn(async () => ({ p1: "https://signed/p1.jpg" }));

vi.mock("./prisma", () => ({
  prisma: {
    property: { findMany: (...a: unknown[]) => propertyFindMany(...a) },
  },
}));

vi.mock("./property-images", () => ({
  getCoverImageUrls: (...a: unknown[]) => (getCoverImageUrls as (...args: unknown[]) => unknown)(...a),
}));

const {
  listAvailablePropertiesPage,
  encodePropertyListCursor,
  decodePropertyListCursor,
  PROPERTY_LIST_INITIAL_TAKE,
  PROPERTY_LIST_SORT_TIMESTAMP,
} = await import("./property-list-query");

beforeEach(() => {
  vi.clearAllMocks();
  propertyFindMany.mockResolvedValue([]);
});

describe("listAvailablePropertiesPage", () => {
  it("defaults to AVAILABLE only, newest first, take 10", async () => {
    await listAvailablePropertiesPage({ organizationId: "org1" });
    const args = propertyFindMany.mock.calls[0][0];
    expect(args.where.organizationId).toBe("org1");
    expect(args.where.status).toBe("AVAILABLE");
    expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(args.take).toBe(PROPERTY_LIST_INITIAL_TAKE + 1);
    expect(PROPERTY_LIST_SORT_TIMESTAMP).toBe("createdAt");
  });

  it("returns a next cursor when more rows exist", async () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      id: `p${i}`,
      createdAt: new Date(2026, 0, 20 - i),
      title: `P${i}`,
      area: "Noida",
      city: "Noida",
      listingType: "SALE",
      monthlyRent: null,
      salePrice: 100,
      bhk: 3,
      bathrooms: 2,
      builtUpAreaSqft: 1200,
      furnishing: "SEMI_FURNISHED",
      assetClass: "RESIDENTIAL",
      propertyType: "APARTMENT",
      workstations: null,
      cabins: null,
      status: "AVAILABLE",
      coverImage: null,
      propertyCode: `C${i}`,
    }));
    propertyFindMany.mockResolvedValue(rows);
    const result = await listAvailablePropertiesPage({ organizationId: "org1" });
    expect(result.properties).toHaveLength(10);
    expect(result.nextCursor).toBeTruthy();
    expect(result.coverImageUrls.p1).toBe("https://signed/p1.jpg");
  });

  it("scopes organization isolation and never unbounded take", async () => {
    await listAvailablePropertiesPage({ organizationId: "orgA", take: 999 });
    const args = propertyFindMany.mock.calls[0][0];
    expect(args.where.organizationId).toBe("orgA");
    expect(args.take).toBeLessThanOrEqual(51);
  });

  it("lists all statuses when status is explicitly null", async () => {
    await listAvailablePropertiesPage({ organizationId: "org1", status: null });
    const args = propertyFindMany.mock.calls[0][0];
    expect(args.where.status).toBeUndefined();
  });

  it("applies cursor for See More pagination", async () => {
    const cursor = encodePropertyListCursor({ createdAt: new Date("2026-01-10T00:00:00.000Z"), id: "p9" });
    await listAvailablePropertiesPage({ organizationId: "org1", cursor });
    const args = propertyFindMany.mock.calls[0][0];
    expect(args.where.AND).toBeTruthy();
  });
});

describe("property list cursor codec", () => {
  it("round-trips", () => {
    const encoded = encodePropertyListCursor({ createdAt: new Date("2026-01-01T00:00:00.000Z"), id: "abc" });
    expect(decodePropertyListCursor(encoded)).toEqual({ createdAt: "2026-01-01T00:00:00.000Z", id: "abc" });
  });
});
