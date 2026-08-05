import { describe, it, expect } from "vitest";
import { buildFunnelStages, type FunnelStageKey } from "./owner-dashboard-data";

const zeroCounts: Record<FunnelStageKey, number> = {
  newLead: 0,
  qualified: 0,
  matched: 0,
  catalogueShared: 0,
  visitDone: 0,
  negotiation: 0,
  dealClosed: 0,
  paymentReceived: 0,
};

describe("buildFunnelStages", () => {
  it("computes 100% conversion for the first stage relative to itself", () => {
    const stages = buildFunnelStages({ ...zeroCounts, newLead: 100 });
    expect(stages[0].conversionFromStartPct).toBe(100);
    expect(stages[0].conversionFromPreviousPct).toBe(100);
  });

  it("computes conversion percentages relative to the start and previous stage", () => {
    const stages = buildFunnelStages({ ...zeroCounts, newLead: 100, qualified: 50, dealClosed: 10 });
    const qualified = stages.find((s) => s.key === "qualified")!;
    expect(qualified.conversionFromStartPct).toBe(50);
    expect(qualified.conversionFromPreviousPct).toBe(50);

    const dealClosed = stages.find((s) => s.key === "dealClosed")!;
    expect(dealClosed.conversionFromStartPct).toBe(10);
  });

  it("returns 0% everywhere when there are no leads at all", () => {
    const stages = buildFunnelStages(zeroCounts);
    for (const stage of stages) {
      expect(stage.conversionFromStartPct).toBe(0);
      expect(stage.conversionFromPreviousPct).toBe(0);
    }
  });

  it("never divides by zero when a previous stage count is 0 but a later stage has a count", () => {
    const stages = buildFunnelStages({ ...zeroCounts, newLead: 0, qualified: 5 });
    const qualified = stages.find((s) => s.key === "qualified")!;
    expect(qualified.conversionFromPreviousPct).toBe(0);
    expect(Number.isFinite(qualified.conversionFromPreviousPct)).toBe(true);
  });

  it("preserves stage order matching the requested funnel", () => {
    const stages = buildFunnelStages(zeroCounts);
    expect(stages.map((s) => s.key)).toEqual([
      "newLead", "qualified", "matched", "catalogueShared", "visitDone", "negotiation", "dealClosed", "paymentReceived",
    ]);
  });
});
