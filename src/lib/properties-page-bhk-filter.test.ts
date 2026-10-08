import { beforeEach, describe, expect, it, vi } from "vitest";

const count = vi.fn();
const listAvailablePropertiesPage = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({ user: { organizationId: "org-1", role: "ADMIN" } })),
}));
vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org-1" }));
vi.mock("@/lib/prisma", () => ({ prisma: { property: { count: (...args: unknown[]) => count(...args) } } }));
vi.mock("@/lib/perf", () => ({ withTiming: (_name: string, _route: string, query: () => unknown) => query() }));
vi.mock("@/lib/property-list-query", () => ({
  PROPERTY_LIST_INITIAL_TAKE: 10,
  PROPERTY_LIST_SORT_TIMESTAMP: "createdAt",
  listAvailablePropertiesPage: (...args: unknown[]) => listAvailablePropertiesPage(...args),
}));
vi.mock("@/components/properties/property-filters", () => ({ PropertyFilters: () => null }));
vi.mock("@/components/properties/properties-table", () => ({ PropertiesTable: () => null }));
vi.mock("@/components/saved-views/saved-views-bar", () => ({ SavedViewsBar: () => null }));
vi.mock("@/components/properties/property-card", () => ({ PropertyCard: () => null }));
vi.mock("@/components/ui/states", () => ({ EmptyState: () => null }));
vi.mock("@/components/ui/button", () => ({ LinkButton: () => null }));

const { default: PropertiesPage } = await import("../app/(app)/properties/page");

beforeEach(() => {
  vi.clearAllMocks();
  listAvailablePropertiesPage.mockResolvedValue({ properties: [], coverImageUrls: {}, nextCursor: null, listedTimestampField: "createdAt" });
  count.mockResolvedValue(0);
});

async function load(searchParams: Record<string, string | undefined>) {
  await PropertiesPage({ searchParams: Promise.resolve(searchParams) });
  return {
    listing: listAvailablePropertiesPage.mock.calls[0][0],
    countWhere: count.mock.calls[0][0].where,
  };
}

describe("PropertiesPage BHK filter", () => {
  it("filters residential 1 RK for bhk=0 in both queries", async () => {
    const { listing, countWhere } = await load({ bhk: "0" });
    expect(listing).toMatchObject({ assetClass: "RESIDENTIAL", bhk: 0 });
    expect(countWhere).toMatchObject({ assetClass: "RESIDENTIAL", bhk: 0 });
    expect(listing.bhk).toBe(countWhere.bhk);
  });

  it("filters 1 BHK in both queries", async () => {
    const { listing, countWhere } = await load({ bhk: "1", assetClass: "RESIDENTIAL" });
    expect(listing).toMatchObject({ assetClass: "RESIDENTIAL", bhk: 1 });
    expect(countWhere).toMatchObject({ assetClass: "RESIDENTIAL", bhk: 1 });
    expect(listing.bhk).toBe(countWhere.bhk);
  });

  it("does not apply a BHK filter when missing or invalid", async () => {
    let result = await load({});
    expect(result.listing.bhk).toBeNull();
    expect(result.countWhere).not.toHaveProperty("bhk");

    result = await load({ bhk: "not-a-number" });
    expect(result.listing.bhk).toBeNull();
    expect(result.countWhere).not.toHaveProperty("bhk");
  });

  it("does not treat commercial bhk=0 as residential 1 RK", async () => {
    const { listing, countWhere } = await load({ bhk: "0", assetClass: "COMMERCIAL" });
    expect(listing).toMatchObject({ assetClass: "COMMERCIAL", bhk: null });
    expect(countWhere).toMatchObject({ assetClass: "COMMERCIAL" });
    expect(countWhere).not.toHaveProperty("bhk");
  });
});
