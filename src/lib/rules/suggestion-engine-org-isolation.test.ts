import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Behavioral two-organization test for getPropertySuggestions() - hardened
// to take organizationId as a required parameter and enforce it in its own
// property lookup, rather than depending on every future caller having
// already validated ownership.
// ---------------------------------------------------------------------------

const ORG_A = "org_a";
const ORG_B = "org_b";

const BASE_PROPERTY = {
  area: "Janakpuri",
  listingType: "RENT",
  monthlyRent: 20000,
  salePrice: null,
  status: "AVAILABLE",
  images: "[]",
  coverImage: null,
  imagesUpdatedAt: null,
  updatedAt: new Date(),
  pendingVerification: false,
  ownerId: null,
  ownerPhone: null,
  owner: null,
};

const properties = [
  { id: "a-prop-1", organizationId: ORG_A, ...BASE_PROPERTY },
  { id: "b-prop-1", organizationId: ORG_B, ...BASE_PROPERTY },
];

const propertyFindFirst = vi.fn(async (args: { where: { id: string; organizationId: string } }) =>
  properties.find((p) => p.id === args.where.id && p.organizationId === args.where.organizationId) ?? null
);
const leadCount = vi.fn(async (..._args: unknown[]) => 0);
const visitCount = vi.fn(async (..._args: unknown[]) => 0);
const catalogueShareFindFirst = vi.fn(async (..._args: unknown[]) => null);
const catalogueInteractionCount = vi.fn(async (..._args: unknown[]) => 0);
const dealFindFirst = vi.fn(async (..._args: unknown[]) => null);
const propertyReportCount = vi.fn(async (..._args: unknown[]) => 0);
const propertyAvailabilityReportFindFirst = vi.fn(async (..._args: unknown[]) => null);

vi.mock("../prisma", () => ({
  prisma: {
    property: { findFirst: (...a: unknown[]) => propertyFindFirst(...(a as [never])) },
    lead: { count: (...a: unknown[]) => leadCount(...(a as [never])) },
    visit: { count: (...a: unknown[]) => visitCount(...(a as [never])) },
    catalogueShare: { findFirst: (...a: unknown[]) => catalogueShareFindFirst(...(a as [never])) },
    catalogueInteraction: { count: (...a: unknown[]) => catalogueInteractionCount(...(a as [never])) },
    deal: { findFirst: (...a: unknown[]) => dealFindFirst(...(a as [never])) },
    propertyReport: { count: (...a: unknown[]) => propertyReportCount(...(a as [never])) },
    propertyAvailabilityReport: { findFirst: (...a: unknown[]) => propertyAvailabilityReportFindFirst(...(a as [never])) },
  },
}));

const { getPropertySuggestions } = await import("./suggestion-engine");

beforeEach(() => vi.clearAllMocks());

describe("getPropertySuggestions - organization isolation", () => {
  it("computes suggestions for a property that belongs to the caller's own org", async () => {
    const result = await getPropertySuggestions("a-prop-1", ORG_A);
    expect(propertyFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "a-prop-1", organizationId: ORG_A } }));
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns [] (never another org's suggestions) when ORG_A requests ORG_B's property id directly", async () => {
    const result = await getPropertySuggestions("b-prop-1", ORG_A);
    expect(result).toEqual([]);
    // Confirms no downstream query ever ran against org B's data.
    expect(leadCount).not.toHaveBeenCalled();
  });

  it("the reverse direction also holds", async () => {
    const result = await getPropertySuggestions("a-prop-1", ORG_B);
    expect(result).toEqual([]);
  });
});
