import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Behavioral two-organization isolation test for GET /api/properties.
//
// GET /api/properties previously built its `where` clause from query params
// only, never adding organizationId - so any authenticated user of ANY
// organization could list every property row in the database. This test
// seeds an in-memory fake store with ORG_A and ORG_B properties and a fake
// findMany that genuinely applies the `where.organizationId` predicate the
// route passes in, then asserts an ORG_A-authenticated request never sees
// ORG_B's properties (and vice versa). This fails if the organizationId
// filter is ever removed from the route again.
// ---------------------------------------------------------------------------

const ORG_A = "org_a";
const ORG_B = "org_b";

type FakeProperty = { id: string; organizationId: string; title: string; createdAt: Date };

const properties: FakeProperty[] = [
  { id: "a-prop-1", organizationId: ORG_A, title: "Org A Flat", createdAt: new Date("2026-01-01") },
  { id: "a-prop-2", organizationId: ORG_A, title: "Org A Villa", createdAt: new Date("2026-01-02") },
  { id: "b-prop-1", organizationId: ORG_B, title: "Org B Flat", createdAt: new Date("2026-01-01") },
  { id: "b-prop-2", organizationId: ORG_B, title: "Org B Villa", createdAt: new Date("2026-01-02") },
  { id: "b-prop-3", organizationId: ORG_B, title: "Org B Shop", createdAt: new Date("2026-01-03") },
];

const propertyFindMany = vi.fn(async (args: { where: Record<string, unknown> }) => {
  return properties.filter((p) => p.organizationId === args.where.organizationId);
});
const propertyCount = vi.fn(async (args?: { where?: Record<string, unknown> }) => {
  if (!args?.where?.organizationId) return properties.length;
  return properties.filter((p) => p.organizationId === args.where!.organizationId).length;
});
const propertyCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    property: {
      findMany: (...a: unknown[]) => propertyFindMany(...(a as [never])),
      count: (...a: unknown[]) => propertyCount(...(a as [never])),
      create: (...a: unknown[]) => propertyCreate(...(a as [never])),
    },
  },
}));

let sessionUser: { id: string; role: string } = { id: "org-a-user", role: "ADMIN" };

const { MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { MockApiError };
});

vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    ApiError: MockApiError,
    requireSession: async () => ({ user: sessionUser }),
    handleApiError: (err: unknown) => {
      if (err instanceof MockApiError) return NextResponse.json({ error: err.message }, { status: err.status });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    },
  };
});

const getOrganizationId = vi.fn();
vi.mock("@/lib/organization", () => ({ getOrganizationId: (user?: { id?: string }) => getOrganizationId(user) }));
vi.mock("@/lib/property-timeline", () => ({ appendPropertyTimelineEvent: vi.fn() }));
vi.mock("@/lib/match-recommendations", () => ({ recommendPropertyToWaitingLeads: vi.fn() }));

const { GET } = await import("./route");

function listRequest() {
  return new NextRequest(new Request("https://x.test/api/properties", { method: "GET" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  propertyFindMany.mockImplementation(async (args: { where: Record<string, unknown> }) => properties.filter((p) => p.organizationId === args.where.organizationId));
  getOrganizationId.mockImplementation((user?: { id?: string }) => (user?.id === "org-a-user" ? ORG_A : user?.id === "org-b-user" ? ORG_B : ORG_A));
});

describe("GET /api/properties - organization isolation", () => {
  it("only returns the requesting org's properties, never another org's", async () => {
    sessionUser = { id: "org-a-user", role: "ADMIN" };
    const resA = await GET(listRequest());
    const bodyA = await resA.json();
    expect(bodyA.properties.map((p: FakeProperty) => p.id).sort()).toEqual(["a-prop-1", "a-prop-2"]);

    sessionUser = { id: "org-b-user", role: "ADMIN" };
    const resB = await GET(listRequest());
    const bodyB = await resB.json();
    expect(bodyB.properties.map((p: FakeProperty) => p.id).sort()).toEqual(["b-prop-1", "b-prop-2", "b-prop-3"]);
  });

  it("passes organizationId in the Prisma where clause on every call", async () => {
    sessionUser = { id: "org-a-user", role: "ADMIN" };
    await GET(listRequest());
    expect(propertyFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG_A }) }));
  });
});
