import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Behavioral two-organization test for getCatalogueById() - hardened to take
// organizationId as a required parameter and enforce it in its own lookup
// (findFirst, not findUnique), rather than depending on every caller having
// already validated ownership (one route - the catalogue property-removal
// DELETE handler - did not, and was a real cross-org write gap; see the
// route test for that specific regression case).
// ---------------------------------------------------------------------------

const ORG_A = "org_a";
const ORG_B = "org_b";

const catalogues = [
  { id: "cat-a", organizationId: ORG_A, leadId: "lead-a", title: "Org A Catalogue", status: "ACTIVE", version: 1, token: "tok-a" },
  { id: "cat-b", organizationId: ORG_B, leadId: "lead-b", title: "Org B Catalogue", status: "ACTIVE", version: 1, token: "tok-b" },
];

const catalogueShareFindFirst = vi.fn(async (args: { where: { id: string; organizationId: string } }) =>
  catalogues.find((c) => c.id === args.where.id && c.organizationId === args.where.organizationId) ?? null
);

vi.mock("./prisma", () => ({
  prisma: { catalogueShare: { findFirst: (...a: unknown[]) => catalogueShareFindFirst(...(a as [never])) } },
}));

vi.mock("./api-auth", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { ApiError };
});

const { getCatalogueById } = await import("./catalogues");
const { ApiError } = await import("./api-auth");

beforeEach(() => vi.clearAllMocks());

describe("getCatalogueById - organization isolation", () => {
  it("returns the catalogue when it belongs to the caller's own org", async () => {
    const catalogue = await getCatalogueById("cat-a", ORG_A);
    expect(catalogue.id).toBe("cat-a");
  });

  it("404s (never returns another org's catalogue) when ORG_A requests ORG_B's catalogue id directly", async () => {
    await expect(getCatalogueById("cat-b", ORG_A)).rejects.toThrow(ApiError);
    await expect(getCatalogueById("cat-b", ORG_A)).rejects.toMatchObject({ status: 404 });
  });

  it("the reverse direction also holds", async () => {
    await expect(getCatalogueById("cat-a", ORG_B)).rejects.toMatchObject({ status: 404 });
  });
});
