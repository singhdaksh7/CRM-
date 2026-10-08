import { beforeEach, describe, expect, it, vi } from "vitest";

const visitFindFirst = vi.fn();
const visitUpdate = vi.fn();
const logActivity = vi.fn();
const recordAudit = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    visit: { findFirst: (...args: unknown[]) => visitFindFirst(...args), update: (...args: unknown[]) => visitUpdate(...args) },
  },
}));
vi.mock("./activity", () => ({ logActivity: (...args: unknown[]) => logActivity(...args) }));
vi.mock("./audit", () => ({ recordAudit: (...args: unknown[]) => recordAudit(...args) }));
vi.mock("./api-auth", () => ({ ApiError: class ApiError extends Error {} }));
vi.mock("./notifications", () => ({ createNotification: vi.fn() }));
vi.mock("./property-timeline", () => ({ appendPropertyTimelineEvent: vi.fn() }));
vi.mock("./scoring", () => ({ recalculateLeadScore: vi.fn() }));
vi.mock("./user-select", () => ({ assignedToSelect: {} }));

const { completeActiveVisitForLeadStatusChange } = await import("./visits");
const { completedVisitsWhere } = await import("./visit-progress");

describe("manual Visit Completed lead status synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    visitUpdate.mockResolvedValue({ id: "visit-newest", status: "COMPLETED" });
  });

  it("completes the existing newest active visit without creating a duplicate or changing visit properties", async () => {
    visitFindFirst.mockResolvedValue({ id: "visit-newest", status: "SCHEDULED", completedAt: null });

    await completeActiveVisitForLeadStatusChange({ leadId: "lead-1", organizationId: "org-1", actorId: "user-1" });

    expect(visitFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ leadId: "lead-1", organizationId: "org-1", status: { in: expect.arrayContaining(["SCHEDULED", "IN_PROGRESS"]) } }),
      orderBy: [{ visitDate: "desc" }, { createdAt: "desc" }],
    }));
    expect(visitUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "visit-newest" }, data: expect.objectContaining({ status: "COMPLETED", completedAt: expect.any(Date) }) }));
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ leadId: "lead-1", metadata: expect.objectContaining({ visitId: "visit-newest" }) }));
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "Visit", entityId: "visit-newest", oldValues: { status: "SCHEDULED" } }));
  });

  it("does nothing when the lead has no active related visit, preserving historical visits", async () => {
    visitFindFirst.mockResolvedValue(null);

    await expect(completeActiveVisitForLeadStatusChange({ leadId: "lead-1", organizationId: "org-1", actorId: "user-1" })).resolves.toBeNull();

    expect(visitUpdate).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });
  // Production LEAD-00022 / LEAD-00035 (2026-10-08): the CRM had zero Visit rows, so moving the
  // lead to Visit Completed had nothing to complete. The helper must not fabricate a visit
  // (a Visit needs a property/assignee/date) and must leave only historical rows alone.
  it("lead with zero visits: no visit is created or updated, only historical visits are ignored", async () => {
    visitFindFirst.mockResolvedValue(null);

    await completeActiveVisitForLeadStatusChange({ leadId: "lead-without-visits", organizationId: "org-1", actorId: "user-1" });

    expect(visitFindFirst).toHaveBeenCalledTimes(1);
    expect(visitUpdate).not.toHaveBeenCalled();
    const eligible = visitFindFirst.mock.calls[0][0].where.status.in as string[];
    expect(eligible).not.toEqual(expect.arrayContaining(["COMPLETED"]));
    expect(eligible).not.toEqual(expect.arrayContaining(["CANCELLED"]));
    expect(eligible).not.toEqual(expect.arrayContaining(["RESCHEDULED"]));
  });
});

describe("Visits -> Completed query", () => {
  it("lists by COMPLETED status alone, whatever completedAt, visit date or assignee are", () => {
    const where = completedVisitsWhere("org-1", { id: "admin-1", role: "ADMIN" });
    expect(where).toEqual({ organizationId: "org-1", status: "COMPLETED" });
    expect(where).not.toHaveProperty("completedAt");
    expect(where).not.toHaveProperty("visitDate");
    expect(where).not.toHaveProperty("assignedToId");
  });

  it("scopes a field executive to their own completed visits only", () => {
    expect(completedVisitsWhere("org-1", { id: "fe-1", role: "FIELD_EXECUTIVE" })).toEqual({ organizationId: "org-1", assignedToId: "fe-1", status: "COMPLETED" });
  });
});
