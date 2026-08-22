import { describe, it, expect, vi, beforeEach } from "vitest";

const leadFindMany = vi.fn();
const leadCount = vi.fn();
const followUpFindMany = vi.fn();
const visitFindMany = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    lead: { findMany: (...a: unknown[]) => leadFindMany(...a), count: (...a: unknown[]) => leadCount(...a) },
    followUp: { findMany: (...a: unknown[]) => followUpFindMany(...a) },
    visit: { findMany: (...a: unknown[]) => visitFindMany(...a) },
  },
}));

import { getDataManagerDashboardData } from "./dm-dashboard-data";

const ORG_A = "org_a";

beforeEach(() => {
  vi.clearAllMocks();
  leadFindMany.mockResolvedValue([]);
  leadCount.mockResolvedValue(0);
  followUpFindMany.mockResolvedValue([]);
  visitFindMany.mockResolvedValue([]);
});

describe("getDataManagerDashboardData", () => {
  it("scopes the new/unprocessed leads query to the caller's organization", async () => {
    await getDataManagerDashboardData(ORG_A, { id: "dm_1", role: "DATA_MANAGER" });

    expect(leadFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG_A }) }));
    expect(leadCount).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG_A }) }));
  });

  it("'new/unprocessed' means status NEW or still unassigned - reusing the existing Lead lifecycle, not a new status", async () => {
    await getDataManagerDashboardData(ORG_A, { id: "dm_1", role: "DATA_MANAGER" });

    const where = leadFindMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(expect.arrayContaining([{ status: "NEW" }, { assignedToId: null }]));
  });

  it("bounds the new-leads list with a take limit", async () => {
    await getDataManagerDashboardData(ORG_A, { id: "dm_1", role: "DATA_MANAGER" });
    expect(leadFindMany.mock.calls[0][0].take).toBeGreaterThan(0);
    expect(leadFindMany.mock.calls[0][0].take).toBeLessThanOrEqual(50);
  });

  it("never selects passwordHash or other account fields on any related row", async () => {
    await getDataManagerDashboardData(ORG_A, { id: "dm_1", role: "DATA_MANAGER" });
    const select = leadFindMany.mock.calls[0][0].select;
    expect(select).not.toHaveProperty("assignedTo");
    expect(JSON.stringify(select)).not.toMatch(/passwordHash/i);
  });

  it("delegates today's-work data to the shared service, scoped to the caller (DATA_MANAGER -> org-wide)", async () => {
    await getDataManagerDashboardData(ORG_A, { id: "dm_1", role: "DATA_MANAGER" });
    // getTodaysWork's own org-isolation/role-scoping is covered by
    // todays-work.test.ts - this just proves the DM dashboard actually wires
    // the org/actor through rather than dropping them.
    expect(followUpFindMany.mock.calls[0][0].where.organizationId).toBe(ORG_A);
    expect(followUpFindMany.mock.calls[0][0].where).not.toHaveProperty("ownerId");
  });
});
