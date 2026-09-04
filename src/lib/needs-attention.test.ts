import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Feature 5 (daily-ops hardening): Needs Attention derives, from existing
// Lead/FollowUp/Visit tables only, which active leads have zero forward-
// looking next action. These tests assert the where-clause shape (terminal
// statuses excluded, future-only follow-up/visit `none` filters, FE role
// scope) rather than hitting a real DB - the query itself is exercised at
// the integration level by the API route.
// ---------------------------------------------------------------------------

const leadFindMany = vi.fn();
vi.mock("./prisma", () => ({ prisma: { lead: { findMany: (...a: unknown[]) => leadFindMany(...a) } } }));
vi.mock("./lead-access", () => ({ fieldExecutiveLeadReadWhere: (userId: string) => ({ OR: [{ assignedToId: userId }, { assignedToId: null }] }) }));
vi.mock("./visit-progress", () => ({ ACTIVE_VISIT_STATUSES: ["SCHEDULED", "CONFIRMED", "CLIENT_REACHED", "EMPLOYEE_REACHED", "IN_PROGRESS"] }));

const { getLeadsNeedingAttention, TERMINAL_LEAD_STATUSES } = await import("./needs-attention");

beforeEach(() => {
  vi.clearAllMocks();
  leadFindMany.mockResolvedValue([]);
});

describe("getLeadsNeedingAttention", () => {
  it("excludes every terminal status", async () => {
    await getLeadsNeedingAttention("org1", { id: "admin1", role: "ADMIN" });
    const where = leadFindMany.mock.calls[0][0].where;
    expect(where.status.notIn).toEqual(expect.arrayContaining([...TERMINAL_LEAD_STATUSES]));
  });

  it("requires no future PENDING follow-up", async () => {
    await getLeadsNeedingAttention("org1", { id: "admin1", role: "ADMIN" }, new Date("2026-06-01"));
    const where = leadFindMany.mock.calls[0][0].where;
    expect(where.followUps).toEqual({ none: { status: "PENDING", dueDate: { gte: new Date("2026-06-01") } } });
  });

  it("requires no future active-status visit", async () => {
    await getLeadsNeedingAttention("org1", { id: "admin1", role: "ADMIN" }, new Date("2026-06-01"));
    const where = leadFindMany.mock.calls[0][0].where;
    expect(where.visits).toEqual({ none: { visitDate: { gte: new Date("2026-06-01") }, status: { in: ["SCHEDULED", "CONFIRMED", "CLIENT_REACHED", "EMPLOYEE_REACHED", "IN_PROGRESS"] } } });
  });

  it("does not scope ADMIN or DATA_MANAGER by assignee (org-wide)", async () => {
    await getLeadsNeedingAttention("org1", { id: "admin1", role: "ADMIN" });
    expect(leadFindMany.mock.calls[0][0].where).not.toHaveProperty("OR");

    await getLeadsNeedingAttention("org1", { id: "dm1", role: "DATA_MANAGER" });
    expect(leadFindMany.mock.calls[1][0].where).not.toHaveProperty("OR");
  });

  it("scopes FIELD_EXECUTIVE to their own assigned or unassigned leads only", async () => {
    await getLeadsNeedingAttention("org1", { id: "fe1", role: "FIELD_EXECUTIVE" });
    const where = leadFindMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ assignedToId: "fe1" }, { assignedToId: null }]);
  });

  it("always scopes by organizationId", async () => {
    await getLeadsNeedingAttention("org1", { id: "admin1", role: "ADMIN" });
    expect(leadFindMany.mock.calls[0][0].where.organizationId).toBe("org1");
  });

  it("maps the returned rows to the compact NeedsAttentionLead shape", async () => {
    leadFindMany.mockResolvedValue([
      { id: "l1", leadCode: "LD1", clientName: "Ravi", phone: "999", status: "CONTACTED", priority: "WARM", assignedToId: "fe1", assignedTo: { name: "Priya" }, updatedAt: new Date("2026-01-01") },
    ]);
    const result = await getLeadsNeedingAttention("org1", { id: "admin1", role: "ADMIN" });
    expect(result).toEqual([
      { id: "l1", leadCode: "LD1", clientName: "Ravi", phone: "999", status: "CONTACTED", priority: "WARM", assignedToId: "fe1", assignedToName: "Priya", updatedAt: new Date("2026-01-01") },
    ]);
  });
});
