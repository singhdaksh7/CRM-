import { describe, it, expect, vi, beforeEach } from "vitest";

const leadFindUnique = vi.fn();
const leadUpdate = vi.fn();
const activityCreate = vi.fn();
const followUpFindFirst = vi.fn();
const followUpCreate = vi.fn();
const followUpUpdate = vi.fn();

const tx = {
  lead: { findUnique: (...a: unknown[]) => leadFindUnique(...a), update: (...a: unknown[]) => leadUpdate(...a) },
  activity: { create: (...a: unknown[]) => activityCreate(...a) },
  followUp: {
    findFirst: (...a: unknown[]) => followUpFindFirst(...a),
    create: (...a: unknown[]) => followUpCreate(...a),
    update: (...a: unknown[]) => followUpUpdate(...a),
  },
};

vi.mock("./prisma", () => ({
  prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(tx) },
}));

// api-auth.ts transitively imports the full NextAuth stack, which fails to
// resolve in the vitest environment - mocked with a real Error subclass
// (same pattern used elsewhere, e.g. lead-phones.test.ts).
vi.mock("./api-auth", () => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { ApiError: MockApiError };
});

import { recordCall } from "./record-call";
import { ApiError } from "./api-auth";

const ORG_A = "org_a";
const LEAD_ID = "lead_1";
const ACTOR_ID = "dm_1";

function baseLead(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: LEAD_ID, organizationId: ORG_A, status: "NEW", lostReasonCategory: null, lostReasonDetail: null, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  leadFindUnique.mockResolvedValue(baseLead());
  leadUpdate.mockImplementation((args: { data: Record<string, unknown> }) => Promise.resolve({ ...baseLead(), ...args.data }));
  activityCreate.mockResolvedValue({ id: "activity_1" });
  followUpFindFirst.mockResolvedValue(null);
  followUpCreate.mockResolvedValue({ id: "followup_1" });
  followUpUpdate.mockResolvedValue({ id: "followup_1" });
});

describe("recordCall", () => {
  it("404s when the lead does not belong to the caller's organization (org isolation)", async () => {
    leadFindUnique.mockResolvedValue(baseLead({ organizationId: "org_b" }));
    await expect(
      recordCall({ leadId: LEAD_ID, organizationId: ORG_A, actorId: ACTOR_ID, spokeWithCustomer: true, outcome: "INTERESTED" })
    ).rejects.toMatchObject({ status: 404 });
  });

  it("Interested: logs a PHONE_CALL_MADE activity, bumps NEW -> CONTACTED, sets lastContactedAt, creates no follow-up", async () => {
    await recordCall({ leadId: LEAD_ID, organizationId: ORG_A, actorId: ACTOR_ID, spokeWithCustomer: true, outcome: "INTERESTED" });

    expect(activityCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "PHONE_CALL_MADE", leadId: LEAD_ID }) }));
    expect(leadUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CONTACTED", lastContactedAt: expect.any(Date) }) }));
    expect(followUpCreate).not.toHaveBeenCalled();
    expect(followUpUpdate).not.toHaveBeenCalled();
  });

  it("Needs Time (spoke): requires a callback date/time and creates a PHONE_CALL follow-up", async () => {
    await expect(recordCall({ leadId: LEAD_ID, organizationId: ORG_A, actorId: ACTOR_ID, spokeWithCustomer: true, outcome: "NEEDS_TIME" })).rejects.toMatchObject({ status: 400 });

    await recordCall({ leadId: LEAD_ID, organizationId: ORG_A, actorId: ACTOR_ID, spokeWithCustomer: true, outcome: "NEEDS_TIME", callbackDate: "2026-09-20", callbackTime: "15:00" });
    expect(followUpCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "PHONE_CALL", leadId: LEAD_ID, status: "PENDING" }) }));
  });

  it("Didn't Answer + retry: creates a PHONE_CALL follow-up and does NOT set lastContactedAt (no actual contact)", async () => {
    await recordCall({ leadId: LEAD_ID, organizationId: ORG_A, actorId: ACTOR_ID, spokeWithCustomer: false, outcome: "DIDNT_ANSWER", callbackDate: "2026-09-20", callbackTime: "10:00" });

    expect(followUpCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "PHONE_CALL" }) }));
    const leadUpdateCalls = leadUpdate.mock.calls;
    for (const call of leadUpdateCalls) {
      expect((call[0] as { data: Record<string, unknown> }).data).not.toHaveProperty("lastContactedAt");
    }
  });

  it("reuses an existing PENDING PHONE_CALL follow-up instead of creating a duplicate", async () => {
    followUpFindFirst.mockResolvedValue({ id: "existing_fu", dueDate: new Date("2026-09-18T00:00:00+05:30"), notes: null, status: "PENDING" });

    await recordCall({ leadId: LEAD_ID, organizationId: ORG_A, actorId: ACTOR_ID, spokeWithCustomer: false, outcome: "BUSY", callbackDate: "2026-09-21", callbackTime: "11:00" });

    expect(followUpUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "existing_fu" } }));
    expect(followUpCreate).not.toHaveBeenCalled();
  });

  it("Wrong Number: records the interaction without requiring a callback and never deletes/invalidates the lead", async () => {
    await recordCall({ leadId: LEAD_ID, organizationId: ORG_A, actorId: ACTOR_ID, spokeWithCustomer: false, outcome: "WRONG_NUMBER" });
    expect(followUpCreate).not.toHaveBeenCalled();
    expect(activityCreate).toHaveBeenCalled();
  });

  it("Will Visit/Come: requires date/time and creates a VISIT_EXPECTED follow-up (not a Visit)", async () => {
    await expect(recordCall({ leadId: LEAD_ID, organizationId: ORG_A, actorId: ACTOR_ID, spokeWithCustomer: true, outcome: "WILL_VISIT_COME" })).rejects.toMatchObject({ status: 400 });

    await recordCall({ leadId: LEAD_ID, organizationId: ORG_A, actorId: ACTOR_ID, spokeWithCustomer: true, outcome: "WILL_VISIT_COME", callbackDate: "2026-09-22", callbackTime: "17:00" });
    expect(followUpCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "VISIT_EXPECTED" }) }));
  });

  it("Visit Required: only logs the interaction, never creates a Visit or a follow-up", async () => {
    await recordCall({ leadId: LEAD_ID, organizationId: ORG_A, actorId: ACTOR_ID, spokeWithCustomer: true, outcome: "VISIT_REQUIRED" });
    expect(followUpCreate).not.toHaveBeenCalled();
    expect(activityCreate).toHaveBeenCalled();
  });

  it("Not Interested requires a lost reason category before it will move the lead", async () => {
    await expect(recordCall({ leadId: LEAD_ID, organizationId: ORG_A, actorId: ACTOR_ID, spokeWithCustomer: true, outcome: "NOT_INTERESTED" })).rejects.toBeInstanceOf(ApiError);
  });

  it("Not Interested with OTHER category requires a detail", async () => {
    await expect(
      recordCall({ leadId: LEAD_ID, organizationId: ORG_A, actorId: ACTOR_ID, spokeWithCustomer: true, outcome: "NOT_INTERESTED", lostReasonCategory: "OTHER" })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("Not Interested persists the lost reason and moves Lead.status to NOT_INTERESTED", async () => {
    await recordCall({
      leadId: LEAD_ID,
      organizationId: ORG_A,
      actorId: ACTOR_ID,
      spokeWithCustomer: true,
      outcome: "NOT_INTERESTED",
      lostReasonCategory: "BUDGET",
    });
    expect(leadUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "NOT_INTERESTED", lostReasonCategory: "BUDGET" }) }));
  });

  it("Other requires a comment", async () => {
    await expect(recordCall({ leadId: LEAD_ID, organizationId: ORG_A, actorId: ACTOR_ID, spokeWithCustomer: true, outcome: "OTHER" })).rejects.toMatchObject({ status: 400 });
    await recordCall({ leadId: LEAD_ID, organizationId: ORG_A, actorId: ACTOR_ID, spokeWithCustomer: true, outcome: "OTHER", note: "Asked to call back next month" });
    expect(activityCreate).toHaveBeenCalled();
  });

  it("a lead already past NEW (e.g. QUALIFIED) is not forced back to CONTACTED", async () => {
    leadFindUnique.mockResolvedValue(baseLead({ status: "QUALIFIED" }));
    await recordCall({ leadId: LEAD_ID, organizationId: ORG_A, actorId: ACTOR_ID, spokeWithCustomer: true, outcome: "WANTS_MORE_PROPERTIES" });
    const statusUpdates = leadUpdate.mock.calls.filter((c) => (c[0] as { data: Record<string, unknown> }).data.status);
    expect(statusUpdates).toHaveLength(0);
  });
});
