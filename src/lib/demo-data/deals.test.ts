import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Owner, Property, User } from "@prisma/client";

const dealCreate = vi.fn();
const dealUpdate = vi.fn();
const brokerageCalculationCreate = vi.fn();
const paymentCreate = vi.fn();
const activityCreate = vi.fn();

vi.mock("../prisma", () => ({
  prisma: {
    deal: {
      create: (...a: unknown[]) => dealCreate(...a),
      update: (...a: unknown[]) => dealUpdate(...a),
    },
    brokerageCalculation: { create: (...a: unknown[]) => brokerageCalculationCreate(...a) },
    payment: { create: (...a: unknown[]) => paymentCreate(...a) },
    activity: { create: (...a: unknown[]) => activityCreate(...a) },
  },
}));

import { Rng } from "./rng";
import { createDemoDeals } from "./deals";

const admin = { id: "admin1" } as User;
const fieldExec = { id: "fe1" } as User;
const employees = { admin, dataManagers: [], fieldExecutives: [fieldExec] };

function makeLeads(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `lead${i}` })) as never[];
}
function makeProperties(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `prop${i}`, listingType: i % 2 === 0 ? "RENT" : "SALE", monthlyRent: 20000, salePrice: 5000000,
  })) as unknown as Property[];
}
function makeOwners(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `owner${i}` })) as unknown as Owner[];
}

beforeEach(() => {
  vi.clearAllMocks();
  let nextId = 0;
  dealCreate.mockImplementation((args: { data: Record<string, unknown> }) => Promise.resolve({ id: `db-deal-${nextId++}`, ...args.data }));
});

describe("createDemoDeals - guaranteed scenarios (deterministic, not left to weighted-random chance)", () => {
  it("deal #1 is always NEGOTIATION/OPEN (the stale-negotiation scenario)", async () => {
    const rng = new Rng(20260806);
    await createDemoDeals(rng, makeLeads(20) as never, makeProperties(20), makeOwners(20), employees, 10);
    const deal1 = dealCreate.mock.calls[0][0].data;
    expect(deal1.stage).toBe("NEGOTIATION");
    expect(deal1.status).toBe("OPEN");
  });

  it("deal #2 is always CLOSED_WON with an overdue-pending payment (the overdue-payment scenario)", async () => {
    const rng = new Rng(20260806);
    await createDemoDeals(rng, makeLeads(20) as never, makeProperties(20), makeOwners(20), employees, 10);
    const deal2 = dealCreate.mock.calls[1][0].data;
    expect(deal2.stage).toBe("CLOSED_WON");
    expect(deal2.status).toBe("WON");

    // Payment/BrokerageCalculation are only created for WON deals - assert they actually fired for deal 2.
    const paymentsForDeal2 = paymentCreate.mock.calls.filter((c) => c[0].data.dealId === deal2.id);
    expect(paymentsForDeal2.length).toBe(2);
    expect(paymentsForDeal2.some((c) => c[0].data.status === "PENDING" && c[0].data.dueDate < new Date())).toBe(true);
    expect(brokerageCalculationCreate.mock.calls.some((c) => c[0].data.dealId === deal2.id)).toBe(true);
  });

  it("deal #3 is always CLOSED_WON with a full (non-overdue) payment pair - guarantees Brokerage Analytics has real collected-brokerage data", async () => {
    const rng = new Rng(20260806);
    const result = await createDemoDeals(rng, makeLeads(20) as never, makeProperties(20), makeOwners(20), employees, 10);
    const deal3 = dealCreate.mock.calls[2][0].data;
    expect(deal3.stage).toBe("CLOSED_WON");
    expect(deal3.status).toBe("WON");
    expect(result.wonDealScenarioId).toBe(deal3.id);

    const paymentsForDeal3 = paymentCreate.mock.calls.filter((c) => c[0].data.dealId === deal3.id);
    expect(paymentsForDeal3.length).toBe(2);
    expect(paymentsForDeal3.some((c) => c[0].data.status === "PAID")).toBe(true);
    expect(brokerageCalculationCreate.mock.calls.some((c) => c[0].data.dealId === deal3.id)).toBe(true);
  });

  it("deal #4 is always CLOSED_LOST with a deterministic lostReason/lostReasonCategory pair - guarantees Lost Deal Analysis has real data", async () => {
    const rng = new Rng(20260806);
    const result = await createDemoDeals(rng, makeLeads(20) as never, makeProperties(20), makeOwners(20), employees, 10);
    const deal4 = dealCreate.mock.calls[3][0].data;
    expect(deal4.stage).toBe("CLOSED_LOST");
    expect(deal4.status).toBe("LOST");
    expect(deal4.lostReasonCategory).toBe("PRICE");
    expect(deal4.lostReason).toMatch(/Price/);
    expect(result.lostDealScenarioId).toBe(deal4.id);

    // LOST deals never get payments/brokerage calculations.
    expect(paymentCreate.mock.calls.some((c) => c[0].data.dealId === deal4.id)).toBe(false);
    expect(brokerageCalculationCreate.mock.calls.some((c) => c[0].data.dealId === deal4.id)).toBe(false);
  });

  it("guarantees at least one WON and one LOST deal exist regardless of what the weighted-random draw produces for the remaining deals - the exact production bug this fixes (10 deals, 0 WON, 0 LOST, 0 payments)", async () => {
    const rng = new Rng(20260806);
    await createDemoDeals(rng, makeLeads(20) as never, makeProperties(20), makeOwners(20), employees, 10);

    const statuses = dealCreate.mock.calls.map((c) => c[0].data.status);
    expect(statuses.filter((s) => s === "WON").length).toBeGreaterThanOrEqual(2); // deals #2 and #3
    expect(statuses.filter((s) => s === "LOST").length).toBeGreaterThanOrEqual(1); // deal #4
    expect(paymentCreate).toHaveBeenCalled();
    expect(brokerageCalculationCreate).toHaveBeenCalled();
  });

  it("lostReason and lostReasonCategory are always semantically paired for every LOST deal, not just the guaranteed scenario", async () => {
    // Run with a larger count so the weighted-random draw is very likely to also produce at least one more LOST deal beyond the guaranteed #4, exercising the rng.int() branch of lostReasonIndex too.
    const rng = new Rng(20260806);
    await createDemoDeals(rng, makeLeads(60) as never, makeProperties(60), makeOwners(60), employees, 40);

    for (const call of dealCreate.mock.calls) {
      const data = call[0].data;
      if (data.status !== "LOST") continue;
      const idx = ["PRICE", "LOCATION", "COMPETITION", "BUDGET", "LOAN_REJECTED", "OWNER_ISSUE", "CLIENT_NOT_INTERESTED", "OTHER"].indexOf(data.lostReasonCategory);
      expect(idx).toBeGreaterThanOrEqual(0);
      const reasons = [
        "Price - client found a cheaper option.", "Location - client chose a different area.", "Competition - lost to another broker.",
        "Budget - client's budget changed.", "Loan rejected by the bank.", "Owner issue - owner withdrew or changed terms.",
        "Client no longer interested.", "Other reason.",
      ];
      expect(data.lostReason).toBe(reasons[idx]);
    }
  });
});
