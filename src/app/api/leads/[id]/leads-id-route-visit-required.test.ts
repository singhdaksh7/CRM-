import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// PATCH /api/leads/[id] must never leave a lead at VISIT_COMPLETED without a visit behind it.

const leadFindFirst = vi.fn();
const leadUpdate = vi.fn();
const visitFindFirst = vi.fn();
const visitUpdate = vi.fn();
const visitCreate = vi.fn();
const logActivity = vi.fn();
const notifyRoles = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    lead: { findFirst: (...a: unknown[]) => leadFindFirst(...a), update: (...a: unknown[]) => leadUpdate(...a), findUnique: vi.fn() },
    visit: { findFirst: (...a: unknown[]) => visitFindFirst(...a), update: (...a: unknown[]) => visitUpdate(...a), create: (...a: unknown[]) => visitCreate(...a) },
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
    handleApiError: (err: unknown) =>
      err instanceof MockApiError ? NextResponse.json({ error: err.message }, { status: err.status }) : NextResponse.json({ error: "Internal server error" }, { status: 500 }),
  };
});
vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));
vi.mock("@/lib/activity", () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/scoring", () => ({ recalculateLeadScore: vi.fn() }));
vi.mock("@/lib/lead-matching", () => ({ runMatchingForLead: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notifyRoles: (...a: unknown[]) => notifyRoles(...a), createNotification: vi.fn() }));
vi.mock("@/lib/property-timeline", () => ({ appendPropertyTimelineEvent: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { PATCH } = await import("./route");

const patch = (body: Record<string, unknown>) => new NextRequest(new Request("https://x.test/api/leads/lead1", { method: "PATCH", body: JSON.stringify(body) }));
const params = () => ({ params: Promise.resolve({ id: "lead1" }) });
const LEAD = { id: "lead1", organizationId: "org_default", clientName: "Ravi", leadCode: "LD1", status: "NEGOTIATION", notes: null, moveInDate: null, assignedToId: null };

beforeEach(() => {
  vi.clearAllMocks();
  leadFindFirst.mockResolvedValue(LEAD);
  leadUpdate.mockResolvedValue({ ...LEAD, status: "VISIT_COMPLETED" });
  visitUpdate.mockResolvedValue({ id: "visit-active", status: "COMPLETED" });
});

describe("PATCH /api/leads/[id] -> VISIT_COMPLETED", () => {
  it("zero visits: rejects with a structured VISIT_REQUIRED response, leaves the lead untouched and creates no visit", async () => {
    visitFindFirst.mockResolvedValue(null);

    const res = await PATCH(patch({ status: "VISIT_COMPLETED" }), params());
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toMatchObject({ code: "VISIT_REQUIRED", requiresVisit: true, title: "No visit on record" });
    expect(body.error).toBe("This lead does not have an active visit to complete. Log the completed visit before marking the lead as Visit Completed.");
    expect(leadUpdate).not.toHaveBeenCalled();
    expect(visitCreate).not.toHaveBeenCalled();
    expect(visitUpdate).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("historical visits (completed/cancelled/rescheduled/no-show) do not count as completable", async () => {
    visitFindFirst.mockResolvedValue(null);

    await PATCH(patch({ status: "VISIT_COMPLETED" }), params());

    const statuses = visitFindFirst.mock.calls[0][0].where.status.in as string[];
    for (const historical of ["COMPLETED", "CANCELLED", "RESCHEDULED", "CLIENT_NO_SHOW"]) expect(statuses).not.toContain(historical);
    expect(visitFindFirst.mock.calls[0][0].where).toMatchObject({ leadId: "lead1", organizationId: "org_default" });
  });

  it("existing active visit: the lead moves, that one visit becomes COMPLETED, nothing is created", async () => {
    visitFindFirst.mockResolvedValue({ id: "visit-active", status: "SCHEDULED", completedAt: null });

    const res = await PATCH(patch({ status: "VISIT_COMPLETED" }), params());

    expect(res.status).toBe(200);
    expect(leadUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "VISIT_COMPLETED" }) }));
    expect(visitUpdate).toHaveBeenCalledTimes(1);
    expect(visitUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "visit-active" }, data: expect.objectContaining({ status: "COMPLETED", completedAt: expect.any(Date) }) }));
    expect(visitCreate).not.toHaveBeenCalled();
  });

  it("a lead already at Visit Completed is not blocked from unrelated edits", async () => {
    leadFindFirst.mockResolvedValue({ ...LEAD, status: "VISIT_COMPLETED" });
    visitFindFirst.mockResolvedValue(null);

    const res = await PATCH(patch({ status: "VISIT_COMPLETED", priority: "HOT" }), params());

    expect(res.status).toBe(200);
    expect(visitFindFirst).not.toHaveBeenCalled();
  });

  it("manual status change sends no outbound notification", async () => {
    visitFindFirst.mockResolvedValue({ id: "visit-active", status: "SCHEDULED", completedAt: null });
    await PATCH(patch({ status: "VISIT_COMPLETED" }), params());
    expect(notifyRoles).not.toHaveBeenCalled();
  });
});
