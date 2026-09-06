import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Regression coverage for the manual-shortlist-when-no-automatic-match
// workflow (Lead -> Matching -> Create Catalogue -> New Shortlist -> Add
// Property, when Lead Requirements matching found zero automatic matches).
//
// The real bug that motivated this file was a frontend rendering gate in
// property-matching-workspace.tsx: the "Selected Shortlist" / "Review &
// Create Catalogue" panel only rendered when automatic matches existed
// (`!allEmpty`), so a manually-added property had no reachable UI path to
// actually get submitted - it sat in React state and was silently lost.
// That fix is a pure JSX/rendering change with no service-layer surface, so
// there is nothing to unit-test at that layer; this file instead locks down
// the service-layer contract the fix depends on: createCatalogue() must
// accept and persist a manually-selected property regardless of whether it
// would have matched automatically, while still enforcing organization
// isolation. If either of those regress, the UI fix above is moot.
// ---------------------------------------------------------------------------

const ORG_A = "org_a";
const ORG_B = "org_b";

const lead = { id: "lead-1", organizationId: ORG_A, clientName: "Test Client", assignedToId: null, status: "NEW" };

// Deliberately would NOT be an automatic match for lead-1 (wrong locality,
// wrong BHK, wrong budget) - stands in for "no matching property available"
// while still being a legitimate, catalogue-eligible AVAILABLE property an
// authorized broker chooses to manually shortlist.
const manuallyEligibleProperty = { id: "prop-manual", organizationId: ORG_A, status: "AVAILABLE" };
const crossOrgProperty = { id: "prop-org-b", organizationId: ORG_B, status: "AVAILABLE" };

const catalogueShareRows: Array<Record<string, unknown>> = [];

const prismaMock = {
  lead: { findFirst: vi.fn(async ({ where }: { where: { id: string; organizationId: string } }) => (where.id === lead.id && where.organizationId === lead.organizationId ? lead : null)) },
  property: {
    findMany: vi.fn(async ({ where }: { where: { id: { in: string[] }; organizationId: string } }) => {
      const all = [manuallyEligibleProperty, crossOrgProperty];
      return all.filter((p) => where.id.in.includes(p.id) && p.organizationId === where.organizationId);
    }),
  },
  catalogueShare: {
    findUnique: vi.fn(async () => null), // no token collisions in this test
    create: vi.fn(async ({ data }: { data: Record<string, unknown> & { properties: { create: Record<string, unknown>[] } } }) => {
      const row = { id: `cat-${catalogueShareRows.length + 1}`, version: 1, status: "ACTIVE", ...data, properties: data.properties.create.map((p) => ({ ...p, property: { id: p.propertyId } })) };
      catalogueShareRows.push(row);
      return row;
    }),
  },
};

vi.mock("./prisma", () => ({ prisma: prismaMock }));

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

vi.mock("./activity", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("./notifications", () => ({ notifyRoles: vi.fn(async () => undefined), createNotification: vi.fn(async () => undefined) }));

const { createCatalogue } = await import("./catalogues");
const { ApiError } = await import("./api-auth");

beforeEach(() => {
  vi.clearAllMocks();
  catalogueShareRows.length = 0;
});

describe("createCatalogue - manual shortlist addition (no automatic match required)", () => {
  it("persists a manually-selected AVAILABLE property even though it never would have matched automatically", async () => {
    const catalogue = await createCatalogue({
      leadId: lead.id,
      organizationId: ORG_A,
      createdByUserId: "user-1",
      title: "Shortlist for Test Client",
      includePrice: true,
      includeAddress: false,
      includeBrokerage: false,
      properties: [
        {
          propertyId: manuallyEligibleProperty.id,
          sortOrder: 0,
          priceVisible: true,
          addressVisible: false,
          brokerageVisible: false,
          addedManually: true,
          addedByUserId: "user-1",
        },
      ],
    });

    expect(catalogue.properties).toHaveLength(1);
    expect(catalogue.properties[0].propertyId).toBe(manuallyEligibleProperty.id);
    expect(catalogue.properties[0].addedManually).toBe(true);
  });

  it("still rejects a property from a different organization (tenant isolation is not weakened by manual add)", async () => {
    await expect(
      createCatalogue({
        leadId: lead.id,
        organizationId: ORG_A,
        createdByUserId: "user-1",
        title: "Shortlist for Test Client",
        includePrice: true,
        includeAddress: false,
        includeBrokerage: false,
        properties: [
          { propertyId: crossOrgProperty.id, sortOrder: 0, priceVisible: true, addressVisible: false, brokerageVisible: false, addedManually: true, addedByUserId: "user-1" },
        ],
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(catalogueShareRows).toHaveLength(0);
  });

  it("rejects a property id that does not exist in this organization at all (ineligible property cannot bypass catalogue restrictions)", async () => {
    await expect(
      createCatalogue({
        leadId: lead.id,
        organizationId: ORG_A,
        createdByUserId: "user-1",
        title: "Shortlist for Test Client",
        includePrice: true,
        includeAddress: false,
        includeBrokerage: false,
        properties: [
          { propertyId: "does-not-exist", sortOrder: 0, priceVisible: true, addressVisible: false, brokerageVisible: false, addedManually: true, addedByUserId: "user-1" },
        ],
      })
    ).rejects.toThrow(ApiError);
  });
});
