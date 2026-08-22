import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * simplified-role-workflow (Blocker 1 follow-up pass) - GET
 * /api/leads/[id]/match used its own stale inline check
 * (`lead.assignedToId !== session.user.id`, no unassigned-lead carve-out).
 * Migrated to assertLeadAccessible, the same shared gate used by every other
 * per-lead read route. Covers the 4 required scenarios directly against the
 * route: own-assigned -> 200, unassigned -> 200, another FE's lead -> 403,
 * cross-org -> 404.
 */

const leadFindFirst = vi.fn();
const propertyFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    lead: { findFirst: (...a: unknown[]) => leadFindFirst(...a) },
    property: { findMany: (...a: unknown[]) => propertyFindMany(...a) },
  },
}));

vi.mock("@/lib/matching", () => ({
  matchPropertiesToLead: () => [],
  sectionizeMatches: () => ({}),
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

// assertLeadAccessible: real module, hits prisma.lead.findFirst which is
// mocked above - exercises the actual wiring, not a re-mocked stand-in.
vi.mock("@/lib/lead-access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/lead-access")>("@/lib/lead-access");
  return actual;
});

const { GET } = await import("./route");

function req() {
  return new NextRequest(new Request("https://x.test/api/leads/lead_1/match"));
}
function params() {
  return { params: Promise.resolve({ id: "lead_1" }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  propertyFindMany.mockResolvedValue([]);
});

describe("GET /api/leads/[id]/match - FE access policy (Blocker 1 follow-up)", () => {
  it("FE assigned to self -> 200", async () => {
    sessionUser = { id: "fe_1", role: "FIELD_EXECUTIVE", organizationId: "org_a" };
    leadFindFirst.mockResolvedValue({ id: "lead_1", organizationId: "org_a", assignedToId: "fe_1", preferredLocation: "Baner" });
    const res = await GET(req(), params());
    expect(res.status).toBe(200);
  });

  it("FE, currently-unassigned lead -> 200 (the previously-broken case)", async () => {
    sessionUser = { id: "fe_1", role: "FIELD_EXECUTIVE", organizationId: "org_a" };
    leadFindFirst.mockResolvedValue({ id: "lead_1", organizationId: "org_a", assignedToId: null, preferredLocation: "Baner" });
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
    leadFindFirst.mockResolvedValue(null);
    const res = await GET(req(), params());
    expect(res.status).toBe(404);
  });

  it("ADMIN/DATA_MANAGER behavior is unchanged - any lead in their org, assigned or not", async () => {
    for (const role of ["ADMIN", "DATA_MANAGER"]) {
      sessionUser = { id: "mgr_1", role, organizationId: "org_a" };
      leadFindFirst.mockResolvedValue({ id: "lead_1", organizationId: "org_a", assignedToId: "some_other_fe", preferredLocation: "Baner" });
      const res = await GET(req(), params());
      expect(res.status).toBe(200);
    }
  });
});
