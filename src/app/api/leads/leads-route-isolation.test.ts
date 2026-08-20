import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Behavioral two-organization isolation test for GET /api/leads.
// Same technique as properties-route-isolation.test.ts: an in-memory fake
// store that genuinely applies where.organizationId, so this fails if the
// scoping is ever removed from the route.
// ---------------------------------------------------------------------------

const ORG_A = "org_a";
const ORG_B = "org_b";

type FakeLead = { id: string; organizationId: string; clientName: string };

const leads: FakeLead[] = [
  { id: "a-lead-1", organizationId: ORG_A, clientName: "Org A Client 1" },
  { id: "a-lead-2", organizationId: ORG_A, clientName: "Org A Client 2" },
  { id: "b-lead-1", organizationId: ORG_B, clientName: "Org B Client 1" },
];

const leadFindMany = vi.fn(async (args: { where: Record<string, unknown> }) => leads.filter((l) => l.organizationId === args.where.organizationId));

vi.mock("@/lib/prisma", () => ({
  prisma: { lead: { findMany: (...a: unknown[]) => leadFindMany(...(a as [never])) } },
}));

let sessionUser: { id: string; role: string } = { id: "org-a-user", role: "ADMIN" };

vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireSession: async () => ({ user: sessionUser }),
    handleApiError: (err: unknown) => NextResponse.json({ error: String(err) }, { status: 500 }),
  };
});

const getOrganizationId = vi.fn();
vi.mock("@/lib/organization", () => ({ getOrganizationId: (userId?: string) => getOrganizationId(userId) }));

const { GET } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  getOrganizationId.mockImplementation((userId?: string) => (userId === "org-a-user" ? ORG_A : ORG_B));
});

describe("GET /api/leads - organization isolation", () => {
  it("only returns the requesting org's leads, never another org's", async () => {
    sessionUser = { id: "org-a-user", role: "ADMIN" };
    const resA = await GET(new NextRequest(new Request("https://x.test/api/leads")));
    const bodyA = await resA.json();
    expect(bodyA.leads.map((l: FakeLead) => l.id).sort()).toEqual(["a-lead-1", "a-lead-2"]);

    sessionUser = { id: "org-b-user", role: "ADMIN" };
    const resB = await GET(new NextRequest(new Request("https://x.test/api/leads")));
    const bodyB = await resB.json();
    expect(bodyB.leads.map((l: FakeLead) => l.id)).toEqual(["b-lead-1"]);
  });
});
