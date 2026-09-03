import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Real org-filtered fake (not a bare vi.fn()) for the "Add Other Properties"
// picker's search endpoint, used from the matching/catalogue workflow -
// proves ORG_A's locality-filtered search can never surface ORG_B's
// properties, even when both orgs have a same-named locality ("Kirti
// Nagar" is a real Delhi locality that could plausibly exist in more than
// one org's inventory).
const ORG_A = "org_a";
const ORG_B = "org_b";

const properties = [
  { id: "prop-a1", organizationId: ORG_A, area: "Kirti Nagar", title: "Org A Kirti Nagar Flat", propertyCode: "A-1", address: "1 A St" },
  { id: "prop-a2", organizationId: ORG_A, area: "Basai Darapur", title: "Org A Basai Darapur Flat", propertyCode: "A-2", address: "2 A St" },
  { id: "prop-b1", organizationId: ORG_B, area: "Kirti Nagar", title: "Org B Kirti Nagar Flat", propertyCode: "B-1", address: "1 B St" },
];

type Where = {
  organizationId: string;
  area?: string;
  OR?: Array<Record<string, { contains: string }>>;
};

const findMany = vi.fn(async (args: { where: Where }) =>
  properties.filter((p) => {
    if (p.organizationId !== args.where.organizationId) return false;
    if (args.where.area && p.area !== args.where.area) return false;
    if (args.where.OR) {
      const q = (args.where.OR[0].propertyCode as { contains: string }).contains;
      const hit =
        p.propertyCode.toLowerCase().includes(q.toLowerCase()) ||
        p.title.toLowerCase().includes(q.toLowerCase()) ||
        p.area.toLowerCase().includes(q.toLowerCase()) ||
        p.address.toLowerCase().includes(q.toLowerCase());
      if (!hit) return false;
    }
    return true;
  })
);

vi.mock("@/lib/prisma", () => ({ prisma: { property: { findMany: (...a: unknown[]) => findMany(...(a as [never])) } } }));
vi.mock("@/lib/property-images", () => ({ getCoverImageUrls: vi.fn(async () => ({})) }));

let currentOrg = ORG_A;
vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireSession: async () => ({ user: { id: "admin", role: "ADMIN", organizationId: currentOrg } }),
    handleApiError: (err: unknown) => NextResponse.json({ error: err instanceof Error ? err.message : "error" }, { status: 500 }),
  };
});
vi.mock("@/lib/organization", () => ({ getOrganizationId: (u: { organizationId: string }) => u.organizationId }));

const { GET } = await import("./route");

function req(qs: string) {
  return new NextRequest(new Request(`https://x.test/api/properties/search${qs}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  currentOrg = ORG_A;
});

describe("GET /api/properties/search - locality-filtered tenant isolation", () => {
  it("ORG_A's locality filter never returns ORG_B's same-named-locality property", async () => {
    const res = await GET(req("?area=Kirti%20Nagar"));
    const body = await res.json();
    expect(body.properties.map((p: { id: string }) => p.id)).toEqual(["prop-a1"]);
  });

  it("ORG_B sees only its own Kirti Nagar property (the reverse direction also holds)", async () => {
    currentOrg = ORG_B;
    const res = await GET(req("?area=Kirti%20Nagar"));
    const body = await res.json();
    expect(body.properties.map((p: { id: string }) => p.id)).toEqual(["prop-b1"]);
  });

  it("combined text + locality search stays org-scoped", async () => {
    const res = await GET(req("?q=Flat&area=Basai%20Darapur"));
    const body = await res.json();
    expect(body.properties.map((p: { id: string }) => p.id)).toEqual(["prop-a2"]);
  });

  it("a locality that only exists in another org returns nothing, not a cross-tenant leak", async () => {
    const res = await GET(req("?area=Basai%20Darapur"));
    currentOrg = ORG_B;
    const res2 = await GET(req("?area=Basai%20Darapur"));
    expect((await res.json()).properties).toHaveLength(1);
    expect((await res2.json()).properties).toEqual([]);
  });
});
