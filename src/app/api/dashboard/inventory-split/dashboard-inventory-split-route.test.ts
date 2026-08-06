import { describe, it, expect, vi, beforeEach } from "vitest";

const propertyGroupBy = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { property: { groupBy: (...a: unknown[]) => propertyGroupBy(...a) } },
}));

vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireSession: async () => ({ user: { id: "admin1", role: "ADMIN" } }),
    handleApiError: (err: unknown) => NextResponse.json({ error: String(err) }, { status: 500 }),
  };
});

vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));

const { GET } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/dashboard/inventory-split", () => {
  it("separates direct and indirect inventory counts via a single groupBy call", async () => {
    propertyGroupBy.mockResolvedValue([
      { inventorySource: "DIRECT", status: "AVAILABLE", _count: 10 },
      { inventorySource: "DIRECT", status: "RENTED", _count: 3 },
      { inventorySource: "INDIRECT", status: "AVAILABLE", _count: 4 },
    ]);

    const res = await GET();
    expect(propertyGroupBy).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.inventorySplit.DIRECT).toEqual({ total: 13, available: 10 });
    expect(body.inventorySplit.INDIRECT).toEqual({ total: 4, available: 4 });
  });

  it("returns zeroed buckets when there is no inventory yet", async () => {
    propertyGroupBy.mockResolvedValue([]);
    const res = await GET();
    const body = await res.json();
    expect(body.inventorySplit).toEqual({ DIRECT: { total: 0, available: 0 }, INDIRECT: { total: 0, available: 0 } });
  });
});
