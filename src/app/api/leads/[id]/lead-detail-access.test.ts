import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * simplified-role-workflow (targeted fix pass, Blocker B) - GET
 * /api/leads/[id] previously used a stale inline check
 * (`lead.assignedToId !== session.user.id`, no unassigned-lead carve-out)
 * that duplicated - incorrectly - the policy assertLeadAccessible already
 * enforced correctly elsewhere. Now shares isLeadAccessibleToUser. This
 * covers the 4 required scenarios directly against the route: own-assigned
 * -> 200, unassigned -> 200, another FE's lead -> denied, cross-org -> 404
 * (the org filter is already in the findFirst where-clause, so a cross-org
 * id simply never resolves to a row).
 */

const leadFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { lead: { findFirst: (...a: unknown[]) => leadFindFirst(...a) } },
}));

let sessionUser: { id: string; role: string; organizationId: string } = { id: "fe_1", role: "FIELD_EXECUTIVE", organizationId: "org_a" };

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

vi.mock("@/lib/organization", () => ({ getOrganizationId: (user: { organizationId: string }) => user.organizationId }));

// isLeadAccessibleToUser is the real (pure, prisma-free) predicate - exercised
// for real here rather than re-mocked, so this test proves the route is
// actually wired to it, not just that some mock returned true.
vi.mock("@/lib/lead-access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/lead-access")>("@/lib/lead-access");
  return actual;
});

const { GET } = await import("./route");

function req() {
  return new NextRequest(new Request("https://x.test/api/leads/lead_1"));
}
function params() {
  return { params: Promise.resolve({ id: "lead_1" }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/leads/[id] - FE access policy (Blocker B)", () => {
  it("FE assigned to self -> 200", async () => {
    sessionUser = { id: "fe_1", role: "FIELD_EXECUTIVE", organizationId: "org_a" };
    leadFindFirst.mockResolvedValue({ id: "lead_1", organizationId: "org_a", assignedToId: "fe_1" });
    const res = await GET(req(), params());
    expect(res.status).toBe(200);
  });

  it("FE, currently-unassigned lead -> 200 (the previously-broken case)", async () => {
    sessionUser = { id: "fe_1", role: "FIELD_EXECUTIVE", organizationId: "org_a" };
    leadFindFirst.mockResolvedValue({ id: "lead_1", organizationId: "org_a", assignedToId: null });
    const res = await GET(req(), params());
    expect(res.status).toBe(200);
  });

  it("FE, another FE's assigned lead -> denied (403)", async () => {
    sessionUser = { id: "fe_1", role: "FIELD_EXECUTIVE", organizationId: "org_a" };
    leadFindFirst.mockResolvedValue({ id: "lead_1", organizationId: "org_a", assignedToId: "other_fe" });
    const res = await GET(req(), params());
    expect(res.status).toBe(403);
  });

  it("FE, cross-org lead id -> denied (404, never reveals existence)", async () => {
    sessionUser = { id: "fe_1", role: "FIELD_EXECUTIVE", organizationId: "org_a" };
    leadFindFirst.mockResolvedValue(null); // the where-clause's organizationId filter is what makes this null
    const res = await GET(req(), params());
    expect(res.status).toBe(404);
    expect(leadFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "org_a" }) }));
  });

  it("ADMIN/DATA_MANAGER behavior is unchanged - any lead in their org, assigned or not", async () => {
    for (const role of ["ADMIN", "DATA_MANAGER"]) {
      sessionUser = { id: "mgr_1", role, organizationId: "org_a" };
      leadFindFirst.mockResolvedValue({ id: "lead_1", organizationId: "org_a", assignedToId: "some_other_fe" });
      const res = await GET(req(), params());
      expect(res.status).toBe(200);
    }
  });
});
