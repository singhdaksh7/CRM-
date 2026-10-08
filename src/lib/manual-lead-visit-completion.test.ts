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
});
