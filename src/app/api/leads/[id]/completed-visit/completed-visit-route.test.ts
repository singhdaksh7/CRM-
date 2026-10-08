import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const leadFindFirst = vi.fn();
const logCompletedVisitForLead = vi.fn();
let sessionUser: { id: string; role: string; name: string } = { id: "admin1", role: "ADMIN", name: "Admin" };

vi.mock("@/lib/prisma", () => ({ prisma: { lead: { findFirst: (...a: unknown[]) => leadFindFirst(...a) } } }));

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
      if (err && typeof err === "object" && "issues" in err) return NextResponse.json({ error: "Validation failed" }, { status: 400 });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    },
  };
});
vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));
vi.mock("@/lib/visits", () => ({ logCompletedVisitForLead: (...a: unknown[]) => logCompletedVisitForLead(...a) }));

const { POST } = await import("./route");
const post = (body: unknown) => new NextRequest(new Request("https://x.test/api/leads/lead1/completed-visit", { method: "POST", body: JSON.stringify(body) }));
const params = () => ({ params: Promise.resolve({ id: "lead1" }) });
const GOOD = { propertyId: "p1", assignedToId: "fe1", visitDate: "2026-10-01", visitTime: "11:30" };

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: "admin1", role: "ADMIN", name: "Admin" };
  leadFindFirst.mockResolvedValue({ id: "lead1", assignedToId: "fe1" });
  logCompletedVisitForLead.mockResolvedValue({ id: "visit-new", status: "COMPLETED" });
});

describe("POST /api/leads/[id]/completed-visit", () => {
  it("creates the completed visit scoped to the session organization and actor", async () => {
    const res = await POST(post(GOOD), params());
    expect(res.status).toBe(201);
    expect(logCompletedVisitForLead).toHaveBeenCalledWith({ organizationId: "org_default", leadId: "lead1", actorId: "admin1", ...GOOD });
  });

  it("404s for a lead outside the organization", async () => {
    leadFindFirst.mockResolvedValue(null);
    expect((await POST(post(GOOD), params())).status).toBe(404);
    expect(leadFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "lead1", organizationId: "org_default" } }));
    expect(logCompletedVisitForLead).not.toHaveBeenCalled();
  });

  it("403s a field executive on a lead assigned to someone else", async () => {
    sessionUser = { id: "fe-other", role: "FIELD_EXECUTIVE", name: "FE" };
    expect((await POST(post(GOOD), params())).status).toBe(403);
    expect(logCompletedVisitForLead).not.toHaveBeenCalled();
  });

  it("400s when property, employee or date are missing or malformed", async () => {
    expect((await POST(post({ ...GOOD, propertyId: "" }), params())).status).toBe(400);
    expect((await POST(post({ ...GOOD, assignedToId: undefined }), params())).status).toBe(400);
    expect((await POST(post({ ...GOOD, visitDate: "yesterday" }), params())).status).toBe(400);
    expect(logCompletedVisitForLead).not.toHaveBeenCalled();
  });
});
