import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Feature 3 (daily-ops hardening): lost/not-interested reason capture on
// Lead, reusing Deal's structured-category + free-text-detail design
// (LostDealReasonCategory). Covers: reason required on CLOSED_LOST/
// NOT_INTERESTED, OTHER requires a detail, an unrelated status change is
// untouched, the reason is recorded on the Activity timeline, and reopening
// a lead clears a stale reason.
// ---------------------------------------------------------------------------

const leadFindFirst = vi.fn();
const leadUpdate = vi.fn();
const leadFindUnique = vi.fn();
const logActivity = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    lead: {
      findFirst: (...a: unknown[]) => leadFindFirst(...a),
      update: (...a: unknown[]) => leadUpdate(...a),
      findUnique: (...a: unknown[]) => leadFindUnique(...a),
    },
  },
}));

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
    requireSession: async () => ({ user: { id: "admin1", role: "ADMIN", name: "Admin" } }),
    handleApiError: (err: unknown) => {
      if (err instanceof MockApiError) return NextResponse.json({ error: err.message }, { status: err.status });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    },
  };
});

vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));
vi.mock("@/lib/activity", () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));
vi.mock("@/lib/scoring", () => ({ recalculateLeadScore: vi.fn() }));
vi.mock("@/lib/lead-matching", () => ({ runMatchingForLead: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notifyRoles: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { PATCH } = await import("./route");

function patchReq(body: Record<string, unknown>) {
  return new NextRequest(new Request("https://x.test/api/leads/lead1", { method: "PATCH", body: JSON.stringify(body) }));
}
function params() {
  return { params: Promise.resolve({ id: "lead1" }) };
}

const BASE_LEAD = {
  id: "lead1",
  organizationId: "org_default",
  clientName: "Ravi",
  leadCode: "LD1",
  status: "NEGOTIATION",
  notes: null,
  moveInDate: null,
  assignedToId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  leadFindFirst.mockResolvedValue(BASE_LEAD);
  leadUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...BASE_LEAD, ...data }));
  leadFindUnique.mockResolvedValue({ ...BASE_LEAD, status: "CLOSED_LOST" });
});

describe("PATCH /api/leads/[id] - lost reason required on terminal transition", () => {
  it("rejects moving to CLOSED_LOST with no reason", async () => {
    const res = await PATCH(patchReq({ status: "CLOSED_LOST" }), params());
    expect(res.status).toBe(400);
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it("rejects moving to NOT_INTERESTED with no reason", async () => {
    const res = await PATCH(patchReq({ status: "NOT_INTERESTED" }), params());
    expect(res.status).toBe(400);
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it("accepts CLOSED_LOST with a structured reason and persists it", async () => {
    const res = await PATCH(patchReq({ status: "CLOSED_LOST", lostReasonCategory: "PRICE" }), params());
    expect(res.status).toBe(200);
    expect(leadUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lostReasonCategory: "PRICE", lostReasonDetail: null }) }));
  });

  it("rejects OTHER with no free-text detail", async () => {
    const res = await PATCH(patchReq({ status: "CLOSED_LOST", lostReasonCategory: "OTHER" }), params());
    expect(res.status).toBe(400);
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it("accepts OTHER with a detail", async () => {
    const res = await PATCH(patchReq({ status: "CLOSED_LOST", lostReasonCategory: "OTHER", lostReasonDetail: "Moving abroad" }), params());
    expect(res.status).toBe(200);
    expect(leadUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lostReasonCategory: "OTHER", lostReasonDetail: "Moving abroad" }) }));
  });

  it("does not require a reason for a non-terminal status change", async () => {
    const res = await PATCH(patchReq({ status: "QUALIFIED" }), params());
    expect(res.status).toBe(200);
    expect(leadUpdate).toHaveBeenCalled();
    expect(leadUpdate.mock.calls[0][0].data).not.toHaveProperty("lostReasonCategory");
  });

  it("records the reason on the Activity timeline", async () => {
    await PATCH(patchReq({ status: "CLOSED_LOST", lostReasonCategory: "BUDGET" }), params());
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: "lead1",
        type: "STATUS_CHANGED",
        description: expect.stringContaining("Budget"),
        metadata: expect.objectContaining({ lostReasonCategory: "BUDGET" }),
      })
    );
  });

  it("clears a stale lost reason when a terminal lead is reopened", async () => {
    leadFindFirst.mockResolvedValue({ ...BASE_LEAD, status: "CLOSED_LOST", lostReasonCategory: "PRICE", lostReasonDetail: null });
    const res = await PATCH(patchReq({ status: "NEGOTIATION" }), params());
    expect(res.status).toBe(200);
    expect(leadUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lostReasonCategory: null, lostReasonDetail: null }) }));
  });
});
