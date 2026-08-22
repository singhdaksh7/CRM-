import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * simplified-role-workflow (Blocker 1 follow-up pass) - POST
 * /api/leads/[id]/notes used its own stale inline check
 * (`lead.assignedToId !== session.user.id`, no unassigned-lead carve-out),
 * so a field executive could not add a note while working an unassigned
 * lead even though they could open it. Migrated to assertLeadAccessible.
 */

const leadFindFirst = vi.fn();
const leadUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    lead: {
      findFirst: (...a: unknown[]) => leadFindFirst(...a),
      update: (...a: unknown[]) => leadUpdate(...a),
    },
  },
}));

vi.mock("@/lib/activity", () => ({ logActivity: vi.fn() }));

let sessionUser: { id: string; name: string; role: string; organizationId: string } = { id: "fe_1", name: "FE One", role: "FIELD_EXECUTIVE", organizationId: "org_a" };

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

vi.mock("@/lib/lead-access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/lead-access")>("@/lib/lead-access");
  return actual;
});

const { POST } = await import("./route");

function req() {
  return new NextRequest(new Request("https://x.test/api/leads/lead_1/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: "called, no answer" }) }));
}
function params() {
  return { params: Promise.resolve({ id: "lead_1" }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  leadUpdate.mockResolvedValue({ id: "lead_1", notes: "called, no answer" });
});

describe("POST /api/leads/[id]/notes - FE access policy (Blocker 1 follow-up)", () => {
  it("FE assigned to self -> 200", async () => {
    sessionUser = { id: "fe_1", name: "FE One", role: "FIELD_EXECUTIVE", organizationId: "org_a" };
    leadFindFirst.mockResolvedValue({ id: "lead_1", organizationId: "org_a", assignedToId: "fe_1", notes: null });
    const res = await POST(req(), params());
    expect(res.status).toBe(200);
  });

  it("FE, currently-unassigned lead -> 200 (the previously-broken case)", async () => {
    sessionUser = { id: "fe_1", name: "FE One", role: "FIELD_EXECUTIVE", organizationId: "org_a" };
    leadFindFirst.mockResolvedValue({ id: "lead_1", organizationId: "org_a", assignedToId: null, notes: null });
    const res = await POST(req(), params());
    expect(res.status).toBe(200);
  });

  it("FE, another FE's assigned lead -> denied (403)", async () => {
    sessionUser = { id: "fe_1", name: "FE One", role: "FIELD_EXECUTIVE", organizationId: "org_a" };
    leadFindFirst.mockResolvedValue({ id: "lead_1", organizationId: "org_a", assignedToId: "other_fe", notes: null });
    const res = await POST(req(), params());
    expect(res.status).toBe(403);
  });

  it("FE, cross-org lead id -> denied (404)", async () => {
    sessionUser = { id: "fe_1", name: "FE One", role: "FIELD_EXECUTIVE", organizationId: "org_a" };
    leadFindFirst.mockResolvedValue(null);
    const res = await POST(req(), params());
    expect(res.status).toBe(404);
  });

  it("ADMIN/DATA_MANAGER behavior is unchanged - any lead in their org, assigned or not", async () => {
    for (const role of ["ADMIN", "DATA_MANAGER"]) {
      sessionUser = { id: "mgr_1", name: "Manager", role, organizationId: "org_a" };
      leadFindFirst.mockResolvedValue({ id: "lead_1", organizationId: "org_a", assignedToId: "some_other_fe", notes: null });
      const res = await POST(req(), params());
      expect(res.status).toBe(200);
    }
  });
});
