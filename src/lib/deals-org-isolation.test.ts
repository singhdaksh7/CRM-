import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Behavioral two-organization test for the cross-org write ("id
// substitution") protection in src/lib/deals.ts: assertDealLinksBelongToOrg.
// Seeds ORG_A and ORG_B rows into an in-memory fake store and proves that
// linking a Deal (owned by ORG_A) to an ORG_B lead/property/owner/assignee
// id is rejected, while the same ids from ORG_A itself are accepted. This
// is exactly the attack described in the audit: "can Org A submit an Org
// B id and have the server act on it".
// ---------------------------------------------------------------------------

const ORG_A = "org_a";
const ORG_B = "org_b";

const leads = [{ id: "a-lead", organizationId: ORG_A }, { id: "b-lead", organizationId: ORG_B }];
const properties = [{ id: "a-prop", organizationId: ORG_A }, { id: "b-prop", organizationId: ORG_B }];
const owners = [{ id: "a-owner", organizationId: ORG_A }, { id: "b-owner", organizationId: ORG_B }];
const users = [{ id: "a-user", organizationId: ORG_A }, { id: "b-user", organizationId: ORG_B }];

vi.mock("./prisma", () => ({
  prisma: {
    lead: { findFirst: async ({ where }: { where: { id: string; organizationId: string } }) => leads.find((l) => l.id === where.id && l.organizationId === where.organizationId) ?? null },
    property: { findFirst: async ({ where }: { where: { id: string; organizationId: string } }) => properties.find((p) => p.id === where.id && p.organizationId === where.organizationId) ?? null },
    owner: { findFirst: async ({ where }: { where: { id: string; organizationId: string } }) => owners.find((o) => o.id === where.id && o.organizationId === where.organizationId) ?? null },
    user: { findFirst: async ({ where }: { where: { id: string; organizationId: string } }) => users.find((u) => u.id === where.id && u.organizationId === where.organizationId) ?? null },
    deal: { count: vi.fn() },
  },
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

const { assertDealLinksBelongToOrg } = await import("./deals");

beforeEach(() => vi.clearAllMocks());

describe("assertDealLinksBelongToOrg - cross-org id substitution", () => {
  it("accepts leadId/propertyId/ownerId/assignedToId that all belong to the requesting org", async () => {
    await expect(
      assertDealLinksBelongToOrg(ORG_A, { leadId: "a-lead", propertyId: "a-prop", ownerId: "a-owner", assignedToId: "a-user" })
    ).resolves.toBeUndefined();
  });

  it("rejects an ORG_B leadId submitted by an ORG_A caller", async () => {
    await expect(assertDealLinksBelongToOrg(ORG_A, { leadId: "b-lead" })).rejects.toMatchObject({ status: 404 });
  });

  it("rejects an ORG_B propertyId submitted by an ORG_A caller", async () => {
    await expect(assertDealLinksBelongToOrg(ORG_A, { propertyId: "b-prop" })).rejects.toMatchObject({ status: 404 });
  });

  it("rejects an ORG_B ownerId submitted by an ORG_A caller", async () => {
    await expect(assertDealLinksBelongToOrg(ORG_A, { ownerId: "b-owner" })).rejects.toMatchObject({ status: 404 });
  });

  it("rejects an ORG_B assignedToId (employee) submitted by an ORG_A caller", async () => {
    await expect(assertDealLinksBelongToOrg(ORG_A, { assignedToId: "b-user" })).rejects.toMatchObject({ status: 404 });
  });

  it("the reverse direction also holds - ORG_B cannot use ORG_A's ids", async () => {
    await expect(assertDealLinksBelongToOrg(ORG_B, { leadId: "a-lead" })).rejects.toMatchObject({ status: 404 });
    await expect(assertDealLinksBelongToOrg(ORG_B, { leadId: "b-lead" })).resolves.toBeUndefined();
  });
});
