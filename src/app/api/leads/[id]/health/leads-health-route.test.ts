import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Feature 6 (daily-ops hardening, RBAC consistency): GET /api/leads/[id]/health
// previously only org-scoped its lookup (via getLeadHealth), so a
// FIELD_EXECUTIVE could read health for a lead assigned to a DIFFERENT FE
// just by knowing its ID - inconsistent with sibling lead-child routes
// (notes, interactions, match) which already gate through
// assertLeadAccessible. This test locks in the fix.
// ---------------------------------------------------------------------------

const leadFindFirst = vi.fn();
const getLeadHealth = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { lead: { findFirst: (...a: unknown[]) => leadFindFirst(...a) } },
}));
vi.mock("@/lib/rules", () => ({ getLeadHealth: (...a: unknown[]) => getLeadHealth(...a) }));
vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));

let sessionUser: { id: string; role: string } = { id: "fe1", role: "FIELD_EXECUTIVE" };

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

const { GET } = await import("./route");

function req(id: string) {
  return { params: Promise.resolve({ id }) } as { params: Promise<{ id: string }> };
}

beforeEach(() => {
  vi.clearAllMocks();
  getLeadHealth.mockResolvedValue({ label: "HEALTHY", score: 90 });
});

describe("GET /api/leads/[id]/health - FE ownership", () => {
  it("allows a FIELD_EXECUTIVE to read health for their own assigned lead", async () => {
    sessionUser = { id: "fe1", role: "FIELD_EXECUTIVE" };
    leadFindFirst.mockResolvedValue({ id: "lead1", assignedToId: "fe1" });
    const res = await GET(new NextRequest(new Request("https://x.test")), req("lead1"));
    expect(res.status).toBe(200);
  });

  it("allows a FIELD_EXECUTIVE to read health for an unassigned lead", async () => {
    sessionUser = { id: "fe1", role: "FIELD_EXECUTIVE" };
    leadFindFirst.mockResolvedValue({ id: "lead1", assignedToId: null });
    const res = await GET(new NextRequest(new Request("https://x.test")), req("lead1"));
    expect(res.status).toBe(200);
  });

  it("rejects a FIELD_EXECUTIVE reading health for another FE's lead", async () => {
    sessionUser = { id: "fe1", role: "FIELD_EXECUTIVE" };
    leadFindFirst.mockResolvedValue({ id: "lead1", assignedToId: "other-fe" });
    const res = await GET(new NextRequest(new Request("https://x.test")), req("lead1"));
    expect(res.status).toBe(403);
    expect(getLeadHealth).not.toHaveBeenCalled();
  });

  it("allows ADMIN to read health for any lead in the org", async () => {
    sessionUser = { id: "admin1", role: "ADMIN" };
    leadFindFirst.mockResolvedValue({ id: "lead1", assignedToId: "other-fe" });
    const res = await GET(new NextRequest(new Request("https://x.test")), req("lead1"));
    expect(res.status).toBe(200);
  });

  it("404s when the lead doesn't exist in this org", async () => {
    leadFindFirst.mockResolvedValue(null);
    const res = await GET(new NextRequest(new Request("https://x.test")), req("missing"));
    expect(res.status).toBe(404);
  });
});
