import { describe, it, expect, vi, beforeEach } from "vitest";

let queryCallCount = 0;
const visitCount = vi.fn(() => (queryCallCount++, Promise.resolve(0)));
const visitGroupBy = vi.fn(() => (queryCallCount++, Promise.resolve([])));
const userFindMany = vi.fn(() => (queryCallCount++, Promise.resolve([])));
const availabilityReportCount = vi.fn(() => (queryCallCount++, Promise.resolve(0)));
const propertyReportCount = vi.fn(() => (queryCallCount++, Promise.resolve(0)));
const propertyGroupBy = vi.fn(() => (queryCallCount++, Promise.resolve([])));
const propertyCount = vi.fn(() => (queryCallCount++, Promise.resolve(0)));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    visit: { count: (...a: unknown[]) => visitCount(...a), groupBy: (...a: unknown[]) => visitGroupBy(...a) },
    user: { findMany: (...a: unknown[]) => userFindMany(...a) },
    propertyAvailabilityReport: { count: (...a: unknown[]) => availabilityReportCount(...a) },
    propertyReport: { count: (...a: unknown[]) => propertyReportCount(...a) },
    property: { groupBy: (...a: unknown[]) => propertyGroupBy(...a), count: (...a: unknown[]) => propertyCount(...a) },
  },
}));

vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireSession: async () => ({ user: { id: "admin1", role: "ADMIN" } }),
    handleApiError: (err: unknown) => NextResponse.json({ error: String(err) }, { status: 500 }),
  };
});

vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));
vi.mock("@/lib/employee-performance-data", () => ({ getEmployeePerformance: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/rules/inventory-freshness", () => ({ getInventoryFreshnessOverview: vi.fn().mockResolvedValue([]) }));

const { GET } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  queryCallCount = 0;
});

describe("GET /api/dashboard/field-ops-summary", () => {
  it("issues a small, fixed number of Prisma queries regardless of data volume - never a per-record loop", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    // 3 visit.count + 2 visit.groupBy + 1 user.findMany + 1 availabilityReport.count
    // + 1 propertyReport.count + 1 property.groupBy + 2 property.count = 11 fixed queries.
    expect(queryCallCount).toBe(11);
  });

  it("returns the expected summary shape", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.summary).toEqual(
      expect.objectContaining({
        todaysVisitCount: expect.any(Number),
        executiveLiveStatus: expect.any(Array),
        pendingVerificationCount: expect.any(Number),
        directInventoryCount: expect.any(Number),
        indirectInventoryCount: expect.any(Number),
      })
    );
  });
});
