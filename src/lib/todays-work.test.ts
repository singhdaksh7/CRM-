import { describe, it, expect, vi, beforeEach } from "vitest";

const followUpFindMany = vi.fn();
const visitFindMany = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    followUp: { findMany: (...a: unknown[]) => followUpFindMany(...a) },
    visit: { findMany: (...a: unknown[]) => visitFindMany(...a) },
  },
}));

import { getTodaysWork } from "./todays-work";

const ORG_A = "org_a";
const ORG_B = "org_b";
const NOW = new Date("2026-08-22T10:00:00+05:30"); // a Saturday, IST

function followUp(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "fu_1",
    type: "PHONE_CALL",
    dueDate: NOW,
    notes: null,
    ownerId: "fe_1",
    owner: { id: "fe_1", name: "Field Exec" },
    leadId: "lead_1",
    lead: { id: "lead_1", clientName: "Test Lead", phone: "9999999999" },
    ...overrides,
  };
}

describe("getTodaysWork", () => {
  beforeEach(() => {
    followUpFindMany.mockReset();
    visitFindMany.mockReset();
  });

  it("classifies each FollowUpType into the right bucket", async () => {
    followUpFindMany
      .mockResolvedValueOnce([
        followUp({ id: "call", type: "PHONE_CALL" }),
        followUp({ id: "wa", type: "WHATSAPP" }),
        followUp({ id: "visit_expected", type: "VISIT_EXPECTED" }),
        followUp({ id: "general", type: "GENERAL_FOLLOW_UP" }),
        followUp({ id: "other_legacy", type: "PROPERTY_SHARING" }), // folds into GENERAL bucket
      ])
      .mockResolvedValueOnce([]); // overdue
    visitFindMany.mockResolvedValue([]);

    const summary = await getTodaysWork(ORG_A, { id: "admin_1", role: "ADMIN" }, NOW);

    expect(summary.callToday).toBe(1);
    expect(summary.whatsappToday).toBe(1);
    expect(summary.visitExpectedToday).toBe(1);
    expect(summary.generalToday).toBe(2); // GENERAL_FOLLOW_UP + PROPERTY_SHARING
    expect(summary.items.find((i) => i.id === "call")?.kind).toBe("CALL_TODAY");
    expect(summary.items.find((i) => i.id === "other_legacy")?.kind).toBe("GENERAL_FOLLOW_UP_TODAY");
  });

  it("buckets a due-before-today PENDING/OVERDUE follow-up as OVERDUE, never in a today bucket", async () => {
    followUpFindMany
      .mockResolvedValueOnce([]) // due today
      .mockResolvedValueOnce([followUp({ id: "late", type: "PHONE_CALL", dueDate: new Date("2026-08-20T10:00:00+05:30") })]);
    visitFindMany.mockResolvedValue([]);

    const summary = await getTodaysWork(ORG_A, { id: "admin_1", role: "ADMIN" }, NOW);

    expect(summary.overdue).toBe(1);
    expect(summary.callToday).toBe(0);
    expect(summary.items).toHaveLength(1);
    expect(summary.items[0].kind).toBe("OVERDUE");
  });

  it("ADMIN and DATA_MANAGER see org-wide work (no ownerId filter)", async () => {
    followUpFindMany.mockResolvedValue([]);
    visitFindMany.mockResolvedValue([]);

    await getTodaysWork(ORG_A, { id: "admin_1", role: "ADMIN" }, NOW);
    await getTodaysWork(ORG_A, { id: "dm_1", role: "DATA_MANAGER" }, NOW);

    for (const call of followUpFindMany.mock.calls) {
      expect(call[0].where).not.toHaveProperty("ownerId");
    }
  });

  it("FIELD_EXECUTIVE is scoped to their own ownerId - never another employee's follow-ups", async () => {
    followUpFindMany.mockResolvedValue([]);
    visitFindMany.mockResolvedValue([]);

    await getTodaysWork(ORG_A, { id: "fe_1", role: "FIELD_EXECUTIVE" }, NOW);

    for (const call of followUpFindMany.mock.calls) {
      expect(call[0].where.ownerId).toBe("fe_1");
    }
  });

  it("every follow-up query is scoped to the caller's organization, never a different one", async () => {
    followUpFindMany.mockResolvedValue([]);
    visitFindMany.mockResolvedValue([]);

    await getTodaysWork(ORG_A, { id: "admin_1", role: "ADMIN" }, NOW);

    for (const call of followUpFindMany.mock.calls) {
      expect(call[0].where.organizationId).toBe(ORG_A);
      expect(call[0].where.organizationId).not.toBe(ORG_B);
    }
  });

  it("every query passes a bounded take", async () => {
    followUpFindMany.mockResolvedValue([]);
    visitFindMany.mockResolvedValue([]);

    await getTodaysWork(ORG_A, { id: "admin_1", role: "ADMIN" }, NOW);

    for (const call of followUpFindMany.mock.calls) {
      expect(call[0].take).toBeGreaterThan(0);
      expect(call[0].take).toBeLessThanOrEqual(200);
    }
    for (const call of visitFindMany.mock.calls) {
      expect(call[0].take).toBeGreaterThan(0);
    }
  });

  it("visits scope through the existing visitRoleScopeWhere for FIELD_EXECUTIVE (assignedToId, not ownerId)", async () => {
    followUpFindMany.mockResolvedValue([]);
    visitFindMany.mockResolvedValue([]);

    await getTodaysWork(ORG_A, { id: "fe_1", role: "FIELD_EXECUTIVE" }, NOW);

    expect(visitFindMany.mock.calls[0][0].where.assignedToId).toBe("fe_1");
  });

  it("counts a visit today separately from visitsToday, with its own item kind", async () => {
    followUpFindMany.mockResolvedValue([]);
    visitFindMany.mockResolvedValue([
      {
        id: "visit_1",
        visitDate: NOW,
        visitTime: "11:30",
        meetingLocation: "Gate 3",
        assignedToId: "fe_1",
        assignedTo: { id: "fe_1", name: "Field Exec" },
        leadId: "lead_1",
        lead: { id: "lead_1", clientName: "Test Lead", phone: "9999999999" },
        properties: [{ id: "p1" }, { id: "p2" }],
      },
    ]);

    const summary = await getTodaysWork(ORG_A, { id: "admin_1", role: "ADMIN" }, NOW);

    expect(summary.visitsToday).toBe(1);
    expect(summary.items[0].kind).toBe("VISIT_TODAY");
    expect(summary.items[0].propertyCount).toBe(2);
  });

  it("items are sorted chronologically across follow-ups and visits", async () => {
    followUpFindMany
      .mockResolvedValueOnce([followUp({ id: "later", dueDate: new Date("2026-08-22T18:00:00+05:30") })])
      .mockResolvedValueOnce([]);
    visitFindMany.mockResolvedValue([
      {
        id: "visit_early",
        visitDate: new Date("2026-08-22T09:00:00+05:30"),
        visitTime: "09:00",
        meetingLocation: null,
        assignedToId: "fe_1",
        assignedTo: { id: "fe_1", name: "Field Exec" },
        leadId: "lead_2",
        lead: { id: "lead_2", clientName: "Early Lead", phone: "8888888888" },
        properties: [],
      },
    ]);

    const summary = await getTodaysWork(ORG_A, { id: "admin_1", role: "ADMIN" }, NOW);

    expect(summary.items.map((i) => i.id)).toEqual(["visit_early", "later"]);
  });
});
