/**
 * Visit reporting, with the emphasis on NOT producing misleading numbers:
 * no 0% from a zero denominator, no confident average from a two-row sample.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const visitCount = vi.fn();
const visitFindMany = vi.fn();
const visitGroupBy = vi.fn();
const visitPropertyCount = vi.fn();
const visitPropertyAggregate = vi.fn();
const visitPropertyFindMany = vi.fn();
const userFindMany = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    visit: {
      count: (...a: unknown[]) => visitCount(...a),
      findMany: (...a: unknown[]) => visitFindMany(...a),
      groupBy: (...a: unknown[]) => visitGroupBy(...a),
    },
    visitProperty: {
      count: (...a: unknown[]) => visitPropertyCount(...a),
      aggregate: (...a: unknown[]) => visitPropertyAggregate(...a),
      findMany: (...a: unknown[]) => visitPropertyFindMany(...a),
    },
    user: { findMany: (...a: unknown[]) => userFindMany(...a) },
  },
}));

// Bypass the cache so each test observes its own stubbed data.
vi.mock("./cache", () => ({ cached: async (_key: string, _ttl: number, fn: () => unknown) => fn() }));
vi.mock("./perf", () => ({ withTiming: async (_a: string, _b: string, fn: () => unknown) => fn() }));

const { getVisitAnalytics, getManagerVisitBoard, MIN_REACTION_SAMPLE } = await import("./visit-analytics-data");

beforeEach(() => {
  vi.clearAllMocks();
  visitCount.mockResolvedValue(0);
  visitFindMany.mockResolvedValue([]);
  visitGroupBy.mockResolvedValue([]);
  visitPropertyCount.mockResolvedValue(0);
  visitPropertyAggregate.mockResolvedValue({ _avg: { reactionRating: null }, _count: { reactionRating: 0 } });
  visitPropertyFindMany.mockResolvedValue([]);
  userFindMany.mockResolvedValue([]);
});

describe("guarding against misleading figures", () => {
  it("reports a null average properties-per-visit when there are no visits, never 0", async () => {
    const analytics = await getVisitAnalytics("org_default");
    expect(analytics.averagePropertiesPerVisit).toBeNull();
    expect(analytics.visitsScheduled).toBe(0);
  });

  it("suppresses the average reaction score below the minimum sample size", async () => {
    visitPropertyAggregate.mockResolvedValue({ _avg: { reactionRating: 5 }, _count: { reactionRating: MIN_REACTION_SAMPLE - 1 } });
    const analytics = await getVisitAnalytics("org_default");
    expect(analytics.averageReactionScore).toBeNull();
    // The raw sample size is still reported so the UI can explain itself.
    expect(analytics.reactionSampleSize).toBe(MIN_REACTION_SAMPLE - 1);
  });

  it("reports the average once the sample is large enough, rounded to one decimal", async () => {
    visitPropertyAggregate.mockResolvedValue({ _avg: { reactionRating: 3.6666 }, _count: { reactionRating: MIN_REACTION_SAMPLE } });
    const analytics = await getVisitAnalytics("org_default");
    expect(analytics.averageReactionScore).toBe(3.7);
  });

  it("gives an executive with no visits a null completion rate, not 0%", async () => {
    userFindMany.mockResolvedValue([{ id: "emp1", name: "Sagar" }]);
    const analytics = await getVisitAnalytics("org_default");
    expect(analytics.executiveCompletion[0]).toMatchObject({ name: "Sagar", assigned: 0, completed: 0, completionRate: null });
  });

  it("computes a real completion rate when there are visits", async () => {
    userFindMany.mockResolvedValue([{ id: "emp1", name: "Sagar" }]);
    visitGroupBy.mockResolvedValueOnce([{ assignedToId: "emp1", _count: 4 }]).mockResolvedValueOnce([{ assignedToId: "emp1", _count: 3 }]);
    const analytics = await getVisitAnalytics("org_default");
    expect(analytics.executiveCompletion[0].completionRate).toBe(75);
  });

  it("averages properties per visit across real data", async () => {
    visitCount.mockResolvedValue(4);
    visitPropertyCount.mockResolvedValue(10);
    const analytics = await getVisitAnalytics("org_default");
    expect(analytics.averagePropertiesPerVisit).toBe(2.5);
  });
});

describe("high-interest properties", () => {
  it("surfaces 4- and 5-star reactions with a derived label", async () => {
    visitPropertyFindMany.mockResolvedValue([
      { propertyId: "propM", reactionRating: 5, property: { title: "M Block 3BHK", area: "Janakpuri" }, visit: { lead: { clientName: "Rahul Sharma" } } },
      { propertyId: "propF", reactionRating: 4, property: { title: "F Block 2BHK", area: "Janakpuri" }, visit: { lead: { clientName: "Rahul Sharma" } } },
    ]);
    const analytics = await getVisitAnalytics("org_default");
    expect(analytics.highInterestProperties).toEqual([
      { propertyId: "propM", title: "M Block 3BHK", area: "Janakpuri", rating: 5, label: "HIGHLY_INTERESTED", clientName: "Rahul Sharma" },
      { propertyId: "propF", title: "F Block 2BHK", area: "Janakpuri", rating: 4, label: "INTERESTED", clientName: "Rahul Sharma" },
    ]);
  });

  it("only queries ratings of 4 or above", async () => {
    await getVisitAnalytics("org_default");
    expect(visitPropertyFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ reactionRating: { gte: 4 } }) }));
  });
});

describe("manager visit board", () => {
  it("builds the required per-visit summary line", async () => {
    visitFindMany.mockResolvedValue([
      {
        id: "v1",
        status: "IN_PROGRESS",
        lead: { clientName: "Rahul Sharma" },
        assignedTo: { name: "Sagar" },
        properties: [{ status: "VISITED", reactionRating: 4 }, { status: "PENDING", reactionRating: null }, { status: "PENDING", reactionRating: null }],
      },
    ]);
    const board = await getManagerVisitBoard("org_default");
    expect(board.todaySummaries[0].summary).toBe("Rahul - Sagar - 3 Properties - 1/3 visited");
    expect(board.visitsTodayCount).toBe(1);
  });

  it("labels an unassigned visit rather than dropping it", async () => {
    visitFindMany.mockResolvedValue([{ id: "v1", status: "SCHEDULED", lead: { clientName: "Neha Gupta" }, assignedTo: null, properties: [{ status: "PENDING", reactionRating: null }] }]);
    const board = await getManagerVisitBoard("org_default");
    expect(board.todaySummaries[0].summary).toContain("Unassigned");
    expect(board.todaySummaries[0].summary).toContain("1 Property");
  });

  it("scopes every count to the organization", async () => {
    await getManagerVisitBoard("org_alpha");
    for (const call of visitCount.mock.calls) expect(call[0].where.organizationId).toBe("org_alpha");
    expect(visitFindMany.mock.calls[0][0].where.organizationId).toBe("org_alpha");
  });

  it("excludes cancelled visits from today's list", async () => {
    await getManagerVisitBoard("org_default");
    expect(visitFindMany.mock.calls[0][0].where.status).toEqual({ notIn: ["CANCELLED"] });
  });
});
