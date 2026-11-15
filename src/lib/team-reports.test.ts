import { describe, it, expect, vi, beforeEach } from "vitest";

const userFindFirst = vi.fn();
const propertyCount = vi.fn();
const visitCount = vi.fn();
const followUpCount = vi.fn();
const activityCount = vi.fn();
const activityFindMany = vi.fn();
const propertyFindMany = vi.fn();
const visitFindMany = vi.fn();
const followUpFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: (...a: unknown[]) => userFindFirst(...a) },
    property: {
      count: (...a: unknown[]) => propertyCount(...a),
      findMany: (...a: unknown[]) => propertyFindMany(...a),
    },
    visit: {
      count: (...a: unknown[]) => visitCount(...a),
      findMany: (...a: unknown[]) => visitFindMany(...a),
    },
    followUp: {
      count: (...a: unknown[]) => followUpCount(...a),
      findMany: (...a: unknown[]) => followUpFindMany(...a),
    },
    activity: {
      count: (...a: unknown[]) => activityCount(...a),
      findMany: (...a: unknown[]) => activityFindMany(...a),
    },
  },
}));

const { resolveTeamReportDateRange, getTeamReportData } = await import("@/lib/team-reports-data");

beforeEach(() => {
  vi.clearAllMocks();
  userFindFirst.mockResolvedValue({ id: "user_1", name: "Executive 1", email: "e1@test.com", role: "FIELD_EXECUTIVE" });
  propertyCount.mockResolvedValue(4);
  visitCount.mockResolvedValue(7);
  followUpCount.mockResolvedValue(5);
  activityCount.mockResolvedValue(12);
  activityFindMany.mockImplementation(async (args: { distinct?: string[] }) => {
    if (args?.distinct) return [{ leadId: "lead_1" }, { leadId: "lead_2" }];
    return [];
  });
  propertyFindMany.mockResolvedValue([]);
  visitFindMany.mockResolvedValue([]);
  followUpFindMany.mockResolvedValue([]);
});

describe("Change 3 — Team Reports & Date Range Attribution", () => {
  const fixedNow = new Date("2026-11-15T12:00:00.000Z"); // 5:30 PM IST on 15 Nov 2026

  it("1. resolves 'today' with IST midnight boundaries", () => {
    const range = resolveTeamReportDateRange({ period: "today", now: fixedNow });
    expect(range.period).toBe("today");
    // In IST, 15 Nov starts at 2026-11-14T18:30:00.000Z
    expect(range.from.toISOString()).toBe("2026-11-14T18:30:00.000Z");
    expect(range.to.toISOString()).toBe("2026-11-15T18:29:59.999Z");
  });

  it("2. resolves 'yesterday' with IST boundaries", () => {
    const range = resolveTeamReportDateRange({ period: "yesterday", now: fixedNow });
    expect(range.period).toBe("yesterday");
    expect(range.from.toISOString()).toBe("2026-11-13T18:30:00.000Z");
    expect(range.to.toISOString()).toBe("2026-11-14T18:29:59.999Z");
  });

  it("3. resolves 'last7' days range", () => {
    const range = resolveTeamReportDateRange({ period: "last7", now: fixedNow });
    expect(range.period).toBe("last7");
    expect(range.to.toISOString()).toBe("2026-11-15T18:29:59.999Z");
    // 7 days window (15 Nov minus 6 days = 9 Nov)
    expect(range.from.toISOString()).toBe("2026-11-08T18:30:00.000Z");
  });

  it("4. resolves 'last30' days range", () => {
    const range = resolveTeamReportDateRange({ period: "last30", now: fixedNow });
    expect(range.period).toBe("last30");
    expect(range.to.toISOString()).toBe("2026-11-15T18:29:59.999Z");
  });

  it("5. resolves custom date range safely", () => {
    const range = resolveTeamReportDateRange({ period: "custom", from: "2026-11-01", to: "2026-11-10", now: fixedNow });
    expect(range.period).toBe("custom");
    expect(range.from.toISOString()).toBe("2026-10-31T18:30:00.000Z");
    expect(range.to.toISOString()).toBe("2026-11-10T18:29:59.999Z");
  });

  it("6. custom range falls back to today if invalid", () => {
    const range = resolveTeamReportDateRange({ period: "custom", from: "invalid", to: "invalid", now: fixedNow });
    expect(range.period).toBe("today");
  });

  it("7. aggregates metrics with organization isolation and user filter", async () => {
    const range = resolveTeamReportDateRange({ period: "today", now: fixedNow });
    const data = await getTeamReportData({ organizationId: "org_alpha", userId: "user_1", range });

    expect(data).not.toBeNull();
    expect(data!.metrics.propertiesAdded).toBe(4);
    expect(data!.metrics.visitsCount).toBe(7);
    expect(data!.metrics.followUpsCompleted).toBe(5);
    expect(data!.metrics.activitiesLogged).toBe(12);
    expect(data!.metrics.leadsWorked).toBe(2);

    // Verify organization scoping on property count
    const propArgs = propertyCount.mock.calls[0][0];
    expect(propArgs.where.organizationId).toBe("org_alpha");
    expect(propArgs.where.createdById).toBe("user_1");

    // Verify organization scoping and status COMPLETED on follow-ups
    const followUpArgs = followUpCount.mock.calls[0][0];
    expect(followUpArgs.where.organizationId).toBe("org_alpha");
    expect(followUpArgs.where.ownerId).toBe("user_1");
    expect(followUpArgs.where.status).toBe("COMPLETED");

    // Verify organization scoping on visits
    const visitArgs = visitCount.mock.calls[0][0];
    expect(visitArgs.where.organizationId).toBe("org_alpha");
    expect(visitArgs.where.assignedToId).toBe("user_1");
  });

  it("8. returns null when user not found in organization", async () => {
    userFindFirst.mockResolvedValue(null);
    const range = resolveTeamReportDateRange({ period: "today", now: fixedNow });
    const data = await getTeamReportData({ organizationId: "org_alpha", userId: "non_existent", range });
    expect(data).toBeNull();
  });
});
