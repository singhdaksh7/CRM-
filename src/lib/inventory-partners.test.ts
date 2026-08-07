import { describe, it, expect, vi, beforeEach } from "vitest";

const propertyGroupBy = vi.fn();
const propertyCount = vi.fn();
const inventoryPartnerCount = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    property: {
      groupBy: (...a: unknown[]) => propertyGroupBy(...a),
      count: (...a: unknown[]) => propertyCount(...a),
    },
    inventoryPartner: {
      count: (...a: unknown[]) => inventoryPartnerCount(...a),
    },
  },
}));

const { getActivePropertyCountsByPartner, getActivePropertyCount, generateInventoryPartnerCode } = await import("./inventory-partners");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getActivePropertyCountsByPartner", () => {
  it("returns an empty map without querying when there are no partner ids", async () => {
    const result = await getActivePropertyCountsByPartner([]);
    expect(result.size).toBe(0);
    expect(propertyGroupBy).not.toHaveBeenCalled();
  });

  it("maps partnerId -> AVAILABLE property count via a single groupBy call", async () => {
    propertyGroupBy.mockResolvedValue([
      { partnerId: "p1", _count: 3 },
      { partnerId: "p2", _count: 0 },
    ]);
    const result = await getActivePropertyCountsByPartner(["p1", "p2"]);
    expect(propertyGroupBy).toHaveBeenCalledTimes(1);
    expect(result.get("p1")).toBe(3);
    expect(result.get("p2")).toBe(0);
  });

  it("filters the AVAILABLE status into the where clause", async () => {
    propertyGroupBy.mockResolvedValue([]);
    await getActivePropertyCountsByPartner(["p1"]);
    const call = propertyGroupBy.mock.calls[0][0];
    expect(call.where.status).toBe("AVAILABLE");
  });
});

describe("getActivePropertyCount", () => {
  it("counts AVAILABLE properties for a single partner", async () => {
    propertyCount.mockResolvedValue(7);
    const result = await getActivePropertyCount("p1");
    expect(result).toBe(7);
    expect(propertyCount).toHaveBeenCalledWith({ where: { partnerId: "p1", status: "AVAILABLE" } });
  });
});

describe("generateInventoryPartnerCode", () => {
  it("generates a zero-padded PTR code from the current count", async () => {
    inventoryPartnerCount.mockResolvedValue(4);
    const code = await generateInventoryPartnerCode();
    expect(code).toBe("PTR-00005");
  });
});
