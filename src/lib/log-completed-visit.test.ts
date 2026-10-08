import { beforeEach, describe, expect, it, vi } from "vitest";

const txVisitCreate = vi.fn();
const txLeadUpdate = vi.fn();
const visitFindFirst = vi.fn();
const leadFindFirst = vi.fn();
const propertyFindFirst = vi.fn();
const userFindFirst = vi.fn();
const logActivity = vi.fn();
const recordAudit = vi.fn();
const createNotification = vi.fn();
const appendPropertyTimelineEvent = vi.fn();
const propertyUpdate = vi.fn();
const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ visit: { create: txVisitCreate }, lead: { update: txLeadUpdate } }));

vi.mock("./prisma", () => ({
  prisma: {
    visit: { findFirst: (...a: unknown[]) => visitFindFirst(...a) },
    lead: { findFirst: (...a: unknown[]) => leadFindFirst(...a) },
    property: { findFirst: (...a: unknown[]) => propertyFindFirst(...a), update: (...a: unknown[]) => propertyUpdate(...a) },
    user: { findFirst: (...a: unknown[]) => userFindFirst(...a) },
    $transaction: (...a: unknown[]) => (transaction as (...args: unknown[]) => unknown)(...a),
  },
}));
vi.mock("./activity", () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));
vi.mock("./audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));
vi.mock("./api-auth", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));
vi.mock("./notifications", () => ({ createNotification: (...a: unknown[]) => createNotification(...a) }));
vi.mock("./property-timeline", () => ({ appendPropertyTimelineEvent: (...a: unknown[]) => appendPropertyTimelineEvent(...a) }));
vi.mock("./scoring", () => ({ recalculateLeadScore: vi.fn() }));
vi.mock("./user-select", () => ({ assignedToSelect: {} }));

const { logCompletedVisitForLead } = await import("./visits");

const INPUT = { organizationId: "org-1", leadId: "lead-1", actorId: "admin-1", propertyId: "prop-1", assignedToId: "fe-1", visitDate: "2026-10-01", visitTime: "11:30", notes: "  liked it  " };

beforeEach(() => {
  vi.clearAllMocks();
  userFindFirst.mockResolvedValue({ id: "fe-1" });
  leadFindFirst.mockResolvedValue({ id: "lead-1", status: "NEGOTIATION" });
  propertyFindFirst.mockResolvedValue({ id: "prop-1", title: "2BHK Rohini" });
  visitFindFirst.mockResolvedValue(null);
  txVisitCreate.mockResolvedValue({ id: "visit-new", status: "COMPLETED" });
  txLeadUpdate.mockResolvedValue({});
});

describe("logCompletedVisitForLead (No visit on record flow)", () => {
  it("creates exactly one COMPLETED visit with property relation, assignee and completedAt, and moves the lead in the same transaction", async () => {
    await logCompletedVisitForLead(INPUT);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txVisitCreate).toHaveBeenCalledTimes(1);
    const data = txVisitCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      organizationId: "org-1",
      leadId: "lead-1",
      propertyId: "prop-1",
      assignedToId: "fe-1",
      createdById: "admin-1",
      status: "COMPLETED",
      visitTime: "11:30",
      employeeNotes: "liked it",
      properties: { create: [{ organizationId: "org-1", propertyId: "prop-1", sequence: 0 }] },
    });
    expect(data.completedAt).toEqual(new Date("2026-10-01T11:30:00+05:30"));
    expect(txLeadUpdate).toHaveBeenCalledWith({ where: { id: "lead-1" }, data: { status: "VISIT_COMPLETED" } });
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ leadId: "lead-1", type: "STATUS_CHANGED", description: "Status changed from Negotiation to Visit Completed" }));
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ leadId: "lead-1", type: "VISIT_COMPLETED", metadata: expect.objectContaining({ visitId: "visit-new" }) }));
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "Visit", entityId: "visit-new", action: "CREATE", userId: "admin-1" }));
  });

  it("transaction failure: the lead is not moved and no activity/audit is written", async () => {
    txVisitCreate.mockRejectedValue(new Error("db down"));

    await expect(logCompletedVisitForLead(INPUT)).rejects.toThrow("db down");

    expect(txLeadUpdate).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("scopes lead, property and assignee to the caller organization", async () => {
    await logCompletedVisitForLead(INPUT);

    expect(leadFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "lead-1", organizationId: "org-1" } }));
    expect(propertyFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "prop-1", organizationId: "org-1" } }));
    expect(userFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "fe-1", organizationId: "org-1", status: "ACTIVE" }) }));
  });

  it("rejects another organization property without writing anything", async () => {
    propertyFindFirst.mockResolvedValue(null);
    await expect(logCompletedVisitForLead(INPUT)).rejects.toMatchObject({ status: 400 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects another organization (or ineligible) employee without writing anything", async () => {
    userFindFirst.mockResolvedValue(null);
    await expect(logCompletedVisitForLead(INPUT)).rejects.toMatchObject({ status: 400 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects another organization lead without writing anything", async () => {
    leadFindFirst.mockResolvedValue(null);
    await expect(logCompletedVisitForLead(INPUT)).rejects.toMatchObject({ status: 404 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("refuses to create a second visit when the lead already has an active visit", async () => {
    visitFindFirst.mockResolvedValue({ id: "visit-active" });
    await expect(logCompletedVisitForLead(INPUT)).rejects.toMatchObject({ status: 409 });
    expect(transaction).not.toHaveBeenCalled();
    expect(txVisitCreate).not.toHaveBeenCalled();
  });

  it("does not invent missing inputs: property, employee, date and future dates are all rejected", async () => {
    await expect(logCompletedVisitForLead({ ...INPUT, propertyId: "" })).rejects.toMatchObject({ status: 400 });
    await expect(logCompletedVisitForLead({ ...INPUT, assignedToId: "" })).rejects.toMatchObject({ status: 400 });
    await expect(logCompletedVisitForLead({ ...INPUT, visitDate: "" })).rejects.toMatchObject({ status: 400 });
    await expect(logCompletedVisitForLead({ ...INPUT, visitDate: "2999-01-01" })).rejects.toMatchObject({ status: 400 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("is internal only: no notification, property timeline event or property write", async () => {
    await logCompletedVisitForLead(INPUT);

    expect(createNotification).not.toHaveBeenCalled();
    expect(appendPropertyTimelineEvent).not.toHaveBeenCalled();
    expect(propertyUpdate).not.toHaveBeenCalled();
  });

  it("does not log a status-change activity when the lead is already Visit Completed (historical correction)", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead-1", status: "VISIT_COMPLETED" });
    await logCompletedVisitForLead(INPUT);
    expect(logActivity).not.toHaveBeenCalledWith(expect.objectContaining({ type: "STATUS_CHANGED" }));
    expect(txVisitCreate).toHaveBeenCalledTimes(1);
  });
});
