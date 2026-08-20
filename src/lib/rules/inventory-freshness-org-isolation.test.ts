import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Behavioral two-organization test for getInventoryFreshness() - hardened to
// take organizationId as a required parameter and enforce it in its own
// property lookup, rather than depending on every future caller having
// already validated ownership.
// ---------------------------------------------------------------------------

const ORG_A = "org_a";
const ORG_B = "org_b";

const properties = [
  { id: "a-prop-1", organizationId: ORG_A, updatedAt: new Date(), lastVerifiedAt: new Date() },
  { id: "b-prop-1", organizationId: ORG_B, updatedAt: new Date(), lastVerifiedAt: new Date() },
];

const propertyFindFirst = vi.fn(async (args: { where: { id: string; organizationId: string } }) =>
  properties.find((p) => p.id === args.where.id && p.organizationId === args.where.organizationId) ?? null
);
const visitFindFirst = vi.fn(async (..._args: unknown[]) => null);

vi.mock("../prisma", () => ({
  prisma: {
    property: { findFirst: (...a: unknown[]) => propertyFindFirst(...(a as [never])) },
    visit: { findFirst: (...a: unknown[]) => visitFindFirst(...(a as [never])) },
  },
}));

vi.mock("../system-config", () => ({
  getSystemConfig: async () => ({ freshnessNeedsVerificationDays: 30, freshnessStaleDays: 60 }),
}));
vi.mock("../cache", () => ({ cached: (_key: string, _ttl: number, compute: () => unknown) => compute() }));

const { getInventoryFreshness } = await import("./inventory-freshness");

beforeEach(() => vi.clearAllMocks());

describe("getInventoryFreshness - organization isolation", () => {
  it("returns a result for a property that belongs to the caller's own org", async () => {
    const result = await getInventoryFreshness("a-prop-1", ORG_A);
    expect(result).not.toBeNull();
  });

  it("returns null (never another org's freshness data) when ORG_A requests ORG_B's property id directly", async () => {
    const result = await getInventoryFreshness("b-prop-1", ORG_A);
    expect(result).toBeNull();
  });

  it("the reverse direction also holds", async () => {
    const result = await getInventoryFreshness("a-prop-1", ORG_B);
    expect(result).toBeNull();
  });
});
