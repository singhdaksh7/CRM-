import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const visitFindFirst = vi.fn();
const visitFeedbackUpsert = vi.fn();
const activityCreate = vi.fn();
const auditLogCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    visit: { findFirst: (...a: unknown[]) => visitFindFirst(...a) },
    visitFeedback: { upsert: (...a: unknown[]) => visitFeedbackUpsert(...a) },
    activity: { create: (...a: unknown[]) => activityCreate(...a) },
  },
}));

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
      if (err && typeof err === "object" && "issues" in err) return NextResponse.json({ error: "Validation failed" }, { status: 400 });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    },
  };
});

vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => auditLogCreate(...a) }));

const { POST } = await import("./route");

function req(body: unknown) {
  return new NextRequest(new Request("https://x.test/api/visits/v1/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}

function params() {
  return { params: Promise.resolve({ id: "v1" }) };
}

const VALID_BODY = { customerLiked: ["Balcony"], willVisitAgain: true };

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: "fe1", role: "FIELD_EXECUTIVE" };
  visitFindFirst.mockResolvedValue({ id: "v1", leadId: "lead1", assignedToId: "fe1" });
  visitFeedbackUpsert.mockResolvedValue({ id: "fb1" });
});

describe("POST /api/visits/[id]/feedback", () => {
  it("404s when the visit doesn't exist", async () => {
    visitFindFirst.mockResolvedValue(null);
    const res = await POST(req(VALID_BODY), params());
    expect(res.status).toBe(404);
  });

  it("denies a FIELD_EXECUTIVE for a visit not assigned to them", async () => {
    visitFindFirst.mockResolvedValue({ id: "v1", leadId: "lead1", assignedToId: "someone-else" });
    const res = await POST(req(VALID_BODY), params());
    expect(res.status).toBe(403);
  });

  it("upserts feedback and logs activity/audit", async () => {
    const res = await POST(req(VALID_BODY), params());
    expect(res.status).toBe(200);
    expect(visitFeedbackUpsert).toHaveBeenCalledWith(expect.objectContaining({ where: { visitId: "v1" } }));
    expect(activityCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "VISIT_FEEDBACK_SUBMITTED" }) }));
    expect(auditLogCreate).toHaveBeenCalled();
  });

  it("allows ADMIN to submit feedback for any visit", async () => {
    sessionUser = { id: "admin1", role: "ADMIN" };
    visitFindFirst.mockResolvedValue({ id: "v1", leadId: "lead1", assignedToId: "fe1" });
    const res = await POST(req(VALID_BODY), params());
    expect(res.status).toBe(200);
  });

  // simplified-role-workflow (targeted fix pass, Correctness issue E) - the
  // rating field that briefly lived on VisitFeedback was removed as a
  // duplicate of VisitProperty.reactionRating/Visit.overallRating before it
  // was ever applied to any database; this route no longer accepts or
  // persists one at all (see the VisitFeedback model comment in
  // schema.prisma for the full reasoning).
  it("does not persist a rating field even if the client sends one (removed, not silently ignored data)", async () => {
    const res = await POST(req({ ...VALID_BODY, rating: 4 }), params());
    expect(res.status).toBe(200);
    const createCall = visitFeedbackUpsert.mock.calls[0][0].create;
    expect(createCall).not.toHaveProperty("rating");
  });
});
