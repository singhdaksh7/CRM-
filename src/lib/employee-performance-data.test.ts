import { describe, it, expect } from "vitest";
import { rankEmployees } from "./employee-performance-data";

const base = {
  id: "1",
  name: "A",
  assignedLeads: 10,
  contacted: 5,
  followUps: 2,
  visits: 3,
  dealsClosed: 2,
  brokerageGenerated: 1000,
  avgResponseTimeHours: 4,
  avgLeadAgeDays: 3,
};

describe("rankEmployees", () => {
  it("computes conversion percentage from dealsClosed / assignedLeads", () => {
    const [ranked] = rankEmployees([{ ...base, assignedLeads: 10, dealsClosed: 3 }]);
    expect(ranked.conversionPct).toBe(30);
  });

  it("returns null (insufficient data) rather than a misleading 0% when an employee has no assigned leads", () => {
    const [ranked] = rankEmployees([{ ...base, assignedLeads: 0, dealsClosed: 0 }]);
    expect(ranked.conversionPct).toBeNull();
  });

  it("sorts by dealsClosed descending, then brokerageGenerated descending", () => {
    const ranked = rankEmployees([
      { ...base, id: "1", name: "Low deals high brokerage", dealsClosed: 1, brokerageGenerated: 9000 },
      { ...base, id: "2", name: "High deals", dealsClosed: 5, brokerageGenerated: 100 },
      { ...base, id: "3", name: "Tied deals, higher brokerage", dealsClosed: 1, brokerageGenerated: 9500 },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(["2", "3", "1"]);
  });
});
