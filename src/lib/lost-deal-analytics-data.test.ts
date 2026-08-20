import { describe, it, expect, vi, beforeEach } from "vitest";

const dealGroupBy = vi.fn();
const dealFindMany = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    deal: {
      groupBy: (...a: unknown[]) => dealGroupBy(...a),
      findMany: (...a: unknown[]) => dealFindMany(...a),
    },
  },
}));

vi.mock("./cache", () => ({
  cached: async (_key: string, _ttl: number, compute: () => Promise<unknown>) => compute(),
}));

import { getLostDealAnalytics } from "./lost-deal-analytics-data";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getLostDealAnalytics - migration-pending fallback", () => {
  it("returns migrationPending: true (not a crash, not a misleading zero) when Deal.lostReasonCategory doesn't exist on the connected database yet", async () => {
    dealGroupBy.mockRejectedValue(new Error('The column `deals.lostReasonCategory` does not exist in the current database.'));
    dealFindMany.mockResolvedValue([]);

    const result = await getLostDealAnalytics("org_default");

    expect(result.migrationPending).toBe(true);
    expect(result.totalLost).toBe(0);
    expect(result.byReason).toEqual([]);
  });

  it("returns migrationPending: false with real data when the query succeeds", async () => {
    dealGroupBy
      .mockResolvedValueOnce([{ lostReasonCategory: "PRICE", _count: { _all: 3 } }])
      .mockResolvedValueOnce([{ lostReasonCategory: "PRICE", _count: { _all: 1 } }]);
    dealFindMany.mockResolvedValue([]);

    const result = await getLostDealAnalytics("org_default");

    expect(result.migrationPending).toBe(false);
    expect(result.totalLost).toBe(3);
  });
});
