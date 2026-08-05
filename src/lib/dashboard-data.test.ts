import { describe, it, expect, vi, beforeEach } from "vitest";

const leadFindMany = vi.fn();
const leadCount = vi.fn();
const leadGroupBy = vi.fn();
const propertyGroupBy = vi.fn();
const followUpCount = vi.fn();
const visitCount = vi.fn();
const whatsAppMessageCount = vi.fn();
const catalogueInteractionCount = vi.fn();
const catalogueInteractionFindMany = vi.fn();
const userFindMany = vi.fn();
const activityFindMany = vi.fn();
const queryRaw = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    lead: {
      findMany: (...a: unknown[]) => leadFindMany(...a),
      count: (...a: unknown[]) => leadCount(...a),
      groupBy: (...a: unknown[]) => leadGroupBy(...a),
    },
    property: {
      groupBy: (...a: unknown[]) => propertyGroupBy(...a),
    },
    followUp: {
      count: (...a: unknown[]) => followUpCount(...a),
    },
    visit: {
      count: (...a: unknown[]) => visitCount(...a),
    },
    whatsAppMessage: {
      count: (...a: unknown[]) => whatsAppMessageCount(...a),
    },
    catalogueInteraction: {
      count: (...a: unknown[]) => catalogueInteractionCount(...a),
      findMany: (...a: unknown[]) => catalogueInteractionFindMany(...a),
    },
    user: {
      findMany: (...a: unknown[]) => userFindMany(...a),
    },
    activity: {
      findMany: (...a: unknown[]) => activityFindMany(...a),
    },
    $queryRaw: (...a: unknown[]) => queryRaw(...a),
  },
}));

vi.mock("./organization", () => ({ getOrganizationId: () => "org_default" }));

// .env sets a real REDIS_URL (Upstash) for local/dev use, and dashboard-data
// leans on it for short-TTL caching - if left unmocked here, every test in
// this file would share the same "dashboard:critical:ADMIN:user1" cache key
// and see whichever mock happened to run first. Force every call through to
// compute() so each test's mocks are actually exercised.
vi.mock("./cache", () => ({
  cached: (_key: string, _ttl: number, compute: () => unknown) => compute(),
  invalidateCache: vi.fn(),
}));

// ./perf's withTiming() is a pure pass-through wrapper around the async fn -
// no need to mock it.

import { getLeadsAwaitingShortlist, getDashboardCriticalData } from "./dashboard-data";

beforeEach(() => {
  vi.clearAllMocks();
  leadFindMany.mockResolvedValue([]);
  leadCount.mockResolvedValue(0);
  leadGroupBy.mockResolvedValue([]);
  propertyGroupBy.mockResolvedValue([]);
  followUpCount.mockResolvedValue(0);
  visitCount.mockResolvedValue(0);
  whatsAppMessageCount.mockResolvedValue(0);
  catalogueInteractionCount.mockResolvedValue(0);
  catalogueInteractionFindMany.mockResolvedValue([]);
  userFindMany.mockResolvedValue([]);
  activityFindMany.mockResolvedValue([]);
  queryRaw.mockResolvedValue([]);
});

describe("getLeadsAwaitingShortlist", () => {
  it("filters to early-pipeline statuses with no active catalogue share, ordered oldest first", async () => {
    leadFindMany.mockResolvedValue([
      { id: "l1", clientName: "Amit", phone: "9999999999", requirementType: "RENT", preferredBhk: 2, preferredLocation: "Janakpuri", minBudget: 20000, maxBudget: 30000, source: "WEBSITE", createdAt: new Date("2026-08-01"), assignedTo: { name: "Priya" } },
    ]);
    leadCount.mockResolvedValue(1);

    const result = await getLeadsAwaitingShortlist("org_default");

    expect(result.leads).toHaveLength(1);
    expect(result.totalCount).toBe(1);

    const findManyArgs = leadFindMany.mock.calls[0][0];
    expect(findManyArgs.where).toMatchObject({
      organizationId: "org_default",
      status: { in: ["NEW", "CONTACTED", "QUALIFIED"] },
      NOT: { catalogueShares: { some: { status: "ACTIVE" } } },
    });
    expect(findManyArgs.orderBy).toEqual({ createdAt: "asc" });
    expect(findManyArgs.take).toBe(20);

    const countArgs = leadCount.mock.calls[0][0];
    expect(countArgs.where).toMatchObject({
      organizationId: "org_default",
      status: { in: ["NEW", "CONTACTED", "QUALIFIED"] },
      NOT: { catalogueShares: { some: { status: "ACTIVE" } } },
    });
  });

  it("falls back to an empty list and zero count if the underlying query throws", async () => {
    leadFindMany.mockRejectedValue(new Error("pool timeout"));
    leadCount.mockRejectedValue(new Error("pool timeout"));

    const result = await getLeadsAwaitingShortlist("org_default");

    expect(result.leads).toEqual([]);
    expect(result.totalCount).toBe(0);
  });
});

describe("getDashboardCriticalData - catalogue & shortlist KPIs", () => {
  it("counts today's sent catalogues from outbound CATALOGUE WhatsAppMessages, not CatalogueShare rows", async () => {
    whatsAppMessageCount.mockResolvedValue(4);

    const data = await getDashboardCriticalData("ADMIN", "user1");

    expect(data.cataloguesSentToday).toBe(4);
    const args = whatsAppMessageCount.mock.calls[0][0];
    expect(args.where).toMatchObject({ organizationId: "org_default", messageType: "CATALOGUE", direction: "OUTBOUND" });
  });

  it("counts distinct catalogueShareId values for cataloguesOpenedToday", async () => {
    catalogueInteractionFindMany.mockResolvedValue([{ catalogueShareId: "cs1" }, { catalogueShareId: "cs2" }]);

    const data = await getDashboardCriticalData("ADMIN", "user1");

    expect(data.cataloguesOpenedToday).toBe(2);
    const args = catalogueInteractionFindMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ organizationId: "org_default", type: "VIEWED" });
    expect(args.distinct).toEqual(["catalogueShareId"]);
  });

  it("counts INTERESTED interactions for clientsInterestedToday", async () => {
    catalogueInteractionCount.mockImplementation((args: { where: { type: string } }) => (args.where.type === "INTERESTED" ? Promise.resolve(7) : Promise.resolve(0)));

    const data = await getDashboardCriticalData("ADMIN", "user1");

    expect(data.clientsInterestedToday).toBe(7);
  });

  it("counts VISIT_REQUESTED interactions for visitRequestsReceivedToday", async () => {
    catalogueInteractionCount.mockImplementation((args: { where: { type: string } }) => (args.where.type === "VISIT_REQUESTED" ? Promise.resolve(3) : Promise.resolve(0)));

    const data = await getDashboardCriticalData("ADMIN", "user1");

    expect(data.visitRequestsReceivedToday).toBe(3);
  });

  it("derives leadsAwaitingShortlistCount from the same early-pipeline/no-active-share filter", async () => {
    leadCount.mockImplementation((args: { where: Record<string, unknown> }) =>
      Array.isArray((args.where.status as { in?: string[] })?.in) ? Promise.resolve(12) : Promise.resolve(0)
    );

    const data = await getDashboardCriticalData("ADMIN", "user1");

    expect(data.leadsAwaitingShortlistCount).toBe(12);
  });

  it("falls back to 0 for any panel whose query throws, without failing the whole call", async () => {
    whatsAppMessageCount.mockRejectedValue(new Error("boom"));
    catalogueInteractionFindMany.mockRejectedValue(new Error("boom"));
    catalogueInteractionCount.mockRejectedValue(new Error("boom"));

    const data = await getDashboardCriticalData("ADMIN", "user1");

    expect(data.cataloguesSentToday).toBe(0);
    expect(data.cataloguesOpenedToday).toBe(0);
    expect(data.clientsInterestedToday).toBe(0);
    expect(data.visitRequestsReceivedToday).toBe(0);
  });
});
