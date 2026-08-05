import { describe, it, expect, vi, beforeEach } from "vitest";

const leadFindUniqueOrThrow = vi.fn();
const propertyFindMany = vi.fn();
const notificationFindFirst = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    lead: {
      findUniqueOrThrow: (...a: unknown[]) => leadFindUniqueOrThrow(...a),
    },
    property: {
      findMany: (...a: unknown[]) => propertyFindMany(...a),
    },
    notification: {
      findFirst: (...a: unknown[]) => notificationFindFirst(...a),
    },
  },
}));

const logActivity = vi.fn();
vi.mock("./activity", () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));

const createNotification = vi.fn();
const notifyRoles = vi.fn();
vi.mock("./notifications", () => ({
  createNotification: (...a: unknown[]) => createNotification(...a),
  notifyRoles: (...a: unknown[]) => notifyRoles(...a),
}));

const matchPropertiesToLead = vi.fn();
vi.mock("./matching", () => ({ matchPropertiesToLead: (...a: unknown[]) => matchPropertiesToLead(...a) }));

const { runMatchingForLead } = await import("./lead-matching");

function lead(overrides: Partial<{ assignedToId: string | null }> = {}) {
  return {
    id: "lead1",
    organizationId: "org_default",
    clientName: "Test Client",
    assignedToId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  propertyFindMany.mockResolvedValue([]);
  notificationFindFirst.mockResolvedValue(null);
});

describe("runMatchingForLead - matches found", () => {
  it("logs MATCHING_STARTED and MATCHES_FOUND activities, then notifies MATCHES_READY", async () => {
    leadFindUniqueOrThrow.mockResolvedValue(lead());
    matchPropertiesToLead.mockReturnValue([{}, {}, {}]);

    const result = await runMatchingForLead("lead1", "created");

    expect(result.matchCount).toBe(3);
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ leadId: "lead1", type: "MATCHING_STARTED" }));
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ leadId: "lead1", type: "MATCHES_FOUND" }));
    expect(notifyRoles).toHaveBeenCalledWith(
      ["ADMIN", "DATA_MANAGER"],
      expect.objectContaining({ type: "MATCHES_READY", leadId: "lead1" })
    );
  });

  it("also notifies the assigned employee directly when the lead is assigned", async () => {
    leadFindUniqueOrThrow.mockResolvedValue(lead({ assignedToId: "emp1" }));
    matchPropertiesToLead.mockReturnValue([{}]);

    await runMatchingForLead("lead1", "created");

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "MATCHES_READY", userId: "emp1", leadId: "lead1" })
    );
  });
});

describe("runMatchingForLead - no matches", () => {
  it("notifies NO_MATCHES_FOUND when zero properties match", async () => {
    leadFindUniqueOrThrow.mockResolvedValue(lead());
    matchPropertiesToLead.mockReturnValue([]);

    const result = await runMatchingForLead("lead1", "created");

    expect(result.matchCount).toBe(0);
    expect(notifyRoles).toHaveBeenCalledWith(
      ["ADMIN", "DATA_MANAGER"],
      expect.objectContaining({ type: "NO_MATCHES_FOUND", leadId: "lead1" })
    );
  });
});

describe("runMatchingForLead - idempotency", () => {
  it("skips notifying again if a MATCHES_READY/NO_MATCHES_FOUND notification already fired recently for this lead", async () => {
    leadFindUniqueOrThrow.mockResolvedValue(lead());
    matchPropertiesToLead.mockReturnValue([{}, {}]);
    notificationFindFirst.mockResolvedValue({ id: "notif1", type: "MATCHES_READY" });

    const result = await runMatchingForLead("lead1", "updated");

    expect(result.matchCount).toBe(2);
    expect(notifyRoles).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("still logs both activities even when the notification is skipped", async () => {
    leadFindUniqueOrThrow.mockResolvedValue(lead());
    matchPropertiesToLead.mockReturnValue([{}]);
    notificationFindFirst.mockResolvedValue({ id: "notif1", type: "MATCHES_READY" });

    await runMatchingForLead("lead1", "updated");

    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ type: "MATCHING_STARTED" }));
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ type: "MATCHES_FOUND" }));
  });
});
