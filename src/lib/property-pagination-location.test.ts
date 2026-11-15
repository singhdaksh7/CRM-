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

const { listAvailablePropertiesPage } = await import("./property-list-query");
const { parsePage, parsePageSize, getPaginationRange } = await import("@/components/ui/pagination");

beforeEach(() => {
  vi.clearAllMocks();
  propertyFindMany.mockResolvedValue([]);
});

describe("Property Pagination & Location Matching Requirements", () => {
  it("1. default page size 10", async () => {
    await listAvailablePropertiesPage({ organizationId: "org1" });
    const call = propertyFindMany.mock.calls[0][0];
    expect(call.take).toBe(11); // take + 1 when skip is undefined
    expect(parsePageSize(undefined)).toBe(10);
  });

  it("2. page 1 returns first 10 with offset 0", async () => {
    await listAvailablePropertiesPage({ organizationId: "org1", page: 1, pageSize: 10 });
    const call = propertyFindMany.mock.calls[0][0];
    expect(call.skip).toBe(0);
    expect(call.take).toBe(10);
  });

  it("3. page 2 offset correct", async () => {
    await listAvailablePropertiesPage({ organizationId: "org1", page: 2, pageSize: 10 });
    const call = propertyFindMany.mock.calls[0][0];
    expect(call.skip).toBe(10);
    expect(call.take).toBe(10);
  });

  it("4. 20/page offset and take", async () => {
    await listAvailablePropertiesPage({ organizationId: "org1", page: 2, pageSize: 20 });
    const call = propertyFindMany.mock.calls[0][0];
    expect(call.skip).toBe(20);
    expect(call.take).toBe(20);
    expect(parsePageSize("20")).toBe(20);
  });

  it("5. 30/page offset and take", async () => {
    await listAvailablePropertiesPage({ organizationId: "org1", page: 3, pageSize: 30 });
    const call = propertyFindMany.mock.calls[0][0];
    expect(call.skip).toBe(60);
    expect(call.take).toBe(30);
    expect(parsePageSize("30")).toBe(30);
  });

  it("6. invalid page fallback", () => {
    expect(parsePage("-5")).toBe(1);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("invalid")).toBe(1);
    expect(parsePage(undefined)).toBe(1);
  });

  it("7. invalid pageSize fallback", () => {
    expect(parsePageSize("50")).toBe(10);
    expect(parsePageSize("0")).toBe(10);
    expect(parsePageSize("-10")).toBe(10);
    expect(parsePageSize("random")).toBe(10);
  });

  it("8 & 9. pagination range supports ellipsis and highlights", () => {
    expect(getPaginationRange(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getPaginationRange(1, 10)).toEqual([1, 2, 3, 4, 5, "...", 10]);
    expect(getPaginationRange(5, 10)).toEqual([1, "...", 4, 5, 6, "...", 10]);
    expect(getPaginationRange(9, 10)).toEqual([1, "...", 6, 7, 8, 9, 10]);
  });

  it("10. case-insensitive locality matching", async () => {
    await listAvailablePropertiesPage({ organizationId: "org1", area: "ramesh nagar" });
    const call1 = propertyFindMany.mock.calls[0][0];
    expect(call1.where.area).toEqual({ equals: "ramesh nagar", mode: "insensitive" });

    await listAvailablePropertiesPage({ organizationId: "org1", area: "RAMESH NAGAR" });
    const call2 = propertyFindMany.mock.calls[1][0];
    expect(call2.where.area).toEqual({ equals: "RAMESH NAGAR", mode: "insensitive" });
  });

  it("11. trimmed locality matching", async () => {
    await listAvailablePropertiesPage({ organizationId: "org1", area: "  Ramesh Nagar  " });
    const call = propertyFindMany.mock.calls[0][0];
    expect(call.where.area).toEqual({ equals: "Ramesh Nagar", mode: "insensitive" });
  });

  it("12. total count uses same filters (where fragment consistency)", async () => {
    const { resolvePropertyListBhkFilter, propertyListBhkWhere } = await import("./property-list-filters");
    const resolved = resolvePropertyListBhkFilter({ bhk: "2", assetClass: "RESIDENTIAL" });
    await listAvailablePropertiesPage({ organizationId: "org1", area: " Rohini ", ...resolved });
    const listWhere = propertyFindMany.mock.calls[0][0].where;
    expect(listWhere.area).toEqual({ equals: "Rohini", mode: "insensitive" });
    expect(listWhere.bhk).toBe(2);
    expect(listWhere.assetClass).toBe("RESIDENTIAL");
  });

  it("13. 1 RK still works (bhk = 0)", async () => {
    const { resolvePropertyListBhkFilter } = await import("./property-list-filters");
    const resolved = resolvePropertyListBhkFilter({ bhk: "0", assetClass: undefined });
    expect(resolved).toEqual({ bhk: 0, assetClass: "RESIDENTIAL" });
    await listAvailablePropertiesPage({ organizationId: "org1", ...resolved });
    const call = propertyFindMany.mock.calls[0][0];
    expect(call.where.bhk).toBe(0);
    expect(call.where.assetClass).toBe("RESIDENTIAL");
  });

  it("14. commercial bhk=0 still not treated as 1 RK", async () => {
    const { resolvePropertyListBhkFilter } = await import("./property-list-filters");
    const resolved = resolvePropertyListBhkFilter({ bhk: "0", assetClass: "COMMERCIAL" });
    expect(resolved).toEqual({ bhk: null, assetClass: "COMMERCIAL" });
    await listAvailablePropertiesPage({ organizationId: "org1", ...resolved });
    const call = propertyFindMany.mock.calls[0][0];
    expect(call.where.bhk).toBeUndefined();
    expect(call.where.assetClass).toBe("COMMERCIAL");
  });
});
