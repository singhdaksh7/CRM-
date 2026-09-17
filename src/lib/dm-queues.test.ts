import { describe, it, expect, vi, beforeEach } from "vitest";

const leadFindMany = vi.fn();
const leadCount = vi.fn();
const followUpFindMany = vi.fn();
const followUpCount = vi.fn();
const visitFindMany = vi.fn();
const activityFindMany = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    lead: { findMany: (...a: unknown[]) => leadFindMany(...a), count: (...a: unknown[]) => leadCount(...a) },
    followUp: { findMany: (...a: unknown[]) => followUpFindMany(...a), count: (...a: unknown[]) => followUpCount(...a) },
    visit: { findMany: (...a: unknown[]) => visitFindMany(...a) },
    activity: { findMany: (...a: unknown[]) => activityFindMany(...a) },
  },
}));

import { getDataManagerQueues } from "./dm-queues";

const ORG_A = "org_a";
const NOW = new Date("2026-09-17T10:00:00+05:30");

function lead(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "lead_1",
    clientName: "Test Lead",
    phone: "9999999999",
    status: "NEW",
    source: "WEBSITE",
    assignedToId: null,
    assignedTo: null,
    preferredLocation: "Dwarka",
    minBudget: 10000,
    maxBudget: 20000,
    requirementType: "RENT",
    createdAt: NOW,
    ...overrides,
  };
}

function followUp(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "fu_1",
    type: "PHONE_CALL",
    status: "PENDING",
    dueDate: NOW,
    notes: null,
    leadId: "lead_1",
    lead: { id: "lead_1", clientName: "Test Lead", phone: "9999999999", activities: [] },
    owner: { id: "dm_1", name: "DM" },
    ...overrides,
  };
}

beforeEach(() => {
  // mockReset (not clearAllMocks) - clears any per-test mockImplementation
  // from the previous test too, so tests never leak into each other.
  leadFindMany.mockReset().mockResolvedValue([]);
  leadCount.mockReset().mockResolvedValue(0);
  followUpFindMany.mockReset().mockResolvedValue([]);
  followUpCount.mockReset().mockResolvedValue(0);
  visitFindMany.mockReset().mockResolvedValue([]);
  activityFindMany.mockReset().mockResolvedValue([]);
});

describe("getDataManagerQueues", () => {
  it("scopes every query to the caller's organization", async () => {
    await getDataManagerQueues(ORG_A, { id: "dm_1", role: "DATA_MANAGER" }, NOW);
    for (const mockFn of [leadFindMany, leadCount, followUpFindMany, followUpCount, visitFindMany, activityFindMany]) {
      for (const call of mockFn.mock.calls) {
        expect((call[0] as { where: Record<string, unknown> }).where.organizationId).toBe(ORG_A);
      }
    }
  });

  it("Pending Calls = leads with no PHONE_CALL_MADE activity ever recorded, oldest first", async () => {
    await getDataManagerQueues(ORG_A, { id: "dm_1", role: "DATA_MANAGER" }, NOW);
    const pendingCallsCall = leadFindMany.mock.calls[1][0]; // [0] is today's leads, [1] is pending calls
    expect(pendingCallsCall.where.activities).toEqual({ none: { type: "PHONE_CALL_MADE" } });
    expect(pendingCallsCall.orderBy).toEqual({ createdAt: "asc" });
  });

  it("a lead that already has a PHONE_CALL_MADE activity never appears in Pending Calls (the query itself excludes it - simulated by an empty findMany result)", async () => {
    leadFindMany.mockResolvedValueOnce([lead()]); // today's leads
    leadFindMany.mockResolvedValueOnce([]); // pending calls: prisma's `none` filter would exclude a contacted lead
    const queues = await getDataManagerQueues(ORG_A, { id: "dm_1", role: "DATA_MANAGER" }, NOW);
    expect(queues.pendingCalls.rows).toHaveLength(0);
    expect(queues.todaysLeads.rows).toHaveLength(1);
  });

  it("Call Again = PENDING/OVERDUE PHONE_CALL follow-ups, overdue first then ascending due date", async () => {
    followUpFindMany.mockResolvedValueOnce([
      followUp({ id: "upcoming", dueDate: new Date("2026-09-20T10:00:00+05:30") }),
      followUp({ id: "overdue", dueDate: new Date("2026-09-10T10:00:00+05:30") }),
      followUp({ id: "today", dueDate: new Date("2026-09-17T14:00:00+05:30") }),
    ]);

    const queues = await getDataManagerQueues(ORG_A, { id: "dm_1", role: "DATA_MANAGER" }, NOW);
    expect(queues.callAgain.rows.map((r) => r.id)).toEqual(["overdue", "today", "upcoming"]);
    expect(queues.callAgain.rows[0].isOverdue).toBe(true);
  });

  it("Visits/Coming includes both active property Visits and active VISIT_EXPECTED follow-ups", async () => {
    visitFindMany.mockResolvedValue([
      { id: "visit_1", leadId: "lead_2", visitDate: NOW, visitTime: "16:00", status: "SCHEDULED", lead: { id: "lead_2", clientName: "V Lead", phone: "111" }, property: { title: "2BHK" }, assignedTo: { name: "FE1" } },
    ]);
    followUpFindMany.mockImplementation((args: { where: { type?: string } }) => {
      if (args.where.type === "VISIT_EXPECTED") {
        return Promise.resolve([followUp({ id: "office_1", type: "VISIT_EXPECTED", leadId: "lead_3", lead: { id: "lead_3", clientName: "Office Lead", phone: "222", activities: [] } })]);
      }
      return Promise.resolve([]);
    });

    const queues = await getDataManagerQueues(ORG_A, { id: "dm_1", role: "DATA_MANAGER" }, NOW);
    expect(queues.visitsComing.rows.map((r) => r.kind)).toEqual(expect.arrayContaining(["PROPERTY_VISIT", "OFFICE_COMING"]));
    expect(queues.visitsComing.count).toBe(2);
  });

  it("a cancelled visit does not count as active (ACTIVE_VISIT_STATUSES excludes CANCELLED)", async () => {
    // The service filters status IN ACTIVE_VISIT_STATUSES at the query level;
    // a mocked empty result simulates the DB never returning the cancelled row.
    visitFindMany.mockResolvedValue([]);
    const queues = await getDataManagerQueues(ORG_A, { id: "dm_1", role: "DATA_MANAGER" }, NOW);
    expect(queues.visitsComing.rows.filter((r) => r.kind === "PROPERTY_VISIT")).toHaveLength(0);
    const visitWhereCall = visitFindMany.mock.calls[0][0];
    expect(visitWhereCall.where.status.in).not.toContain("CANCELLED");
  });

  it("Completed excludes any lead currently in Call Again or Visits/Coming (queue precedence)", async () => {
    followUpFindMany.mockImplementation((args: { where: { type?: string } }) => {
      if (args.where.type === "PHONE_CALL") return Promise.resolve([followUp({ id: "fu_call_again", leadId: "lead_call_again" })]);
      return Promise.resolve([]);
    });
    activityFindMany.mockResolvedValue([
      { id: "a1", leadId: "lead_call_again", createdAt: NOW, metadata: null, lead: { id: "lead_call_again", clientName: "X", phone: "1" } },
      { id: "a2", leadId: "lead_done", createdAt: NOW, metadata: null, lead: { id: "lead_done", clientName: "Y", phone: "2" } },
    ]);

    const queues = await getDataManagerQueues(ORG_A, { id: "dm_1", role: "DATA_MANAGER" }, NOW);
    expect(queues.completed.rows.map((r) => r.leadId)).toEqual(["lead_done"]);
  });

  it("Completed shows exactly one row per lead even with multiple PHONE_CALL_MADE activities today", async () => {
    activityFindMany.mockResolvedValue([
      { id: "a2", leadId: "lead_x", createdAt: new Date("2026-09-17T12:00:00+05:30"), metadata: JSON.stringify({ outcome: "Interested" }), lead: { id: "lead_x", clientName: "X", phone: "1" } },
      { id: "a1", leadId: "lead_x", createdAt: new Date("2026-09-17T09:00:00+05:30"), metadata: JSON.stringify({ outcome: "Didn't Answer" }), lead: { id: "lead_x", clientName: "X", phone: "1" } },
    ]);
    const queues = await getDataManagerQueues(ORG_A, { id: "dm_1", role: "DATA_MANAGER" }, NOW);
    expect(queues.completed.rows).toHaveLength(1);
    expect(queues.completed.rows[0].outcomeLabel).toBe("Interested"); // most recent wins (already sorted desc by the query)
  });

  it("Today's Leads is an intake view and may overlap with an action queue (no filtering applied)", async () => {
    leadFindMany.mockResolvedValueOnce([lead({ id: "lead_overlap" })]); // today's leads
    followUpFindMany.mockImplementation((args: { where: { type?: string } }) => {
      if (args.where.type === "PHONE_CALL") return Promise.resolve([followUp({ id: "fu_1", leadId: "lead_overlap" })]);
      return Promise.resolve([]);
    });

    const queues = await getDataManagerQueues(ORG_A, { id: "dm_1", role: "DATA_MANAGER" }, NOW);
    expect(queues.todaysLeads.rows.map((r) => r.id)).toContain("lead_overlap");
    expect(queues.callAgain.rows.map((r) => r.leadId)).toContain("lead_overlap");
  });
});
