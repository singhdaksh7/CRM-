import { describe, it, expect } from "vitest";
import { selectEmployeeForLead, type EmployeeCandidate } from "./assignment";

function candidate(overrides: Partial<EmployeeCandidate> = {}): EmployeeCandidate {
  return {
    id: "emp1",
    name: "Test Employee",
    activeLeadCount: 0,
    maxActiveLeads: 20,
    todaysAssignedCount: 0,
    speciality: "ALL",
    serviceAreas: [],
    ...overrides,
  };
}

const rentLead = { preferredLocation: "Janakpuri", requirementType: "RENT" as const };
const buyLead = { preferredLocation: "Saket", requirementType: "BUY" as const };

describe("selectEmployeeForLead - capacity handling", () => {
  it("excludes employees at or above their max active lead capacity", () => {
    const candidates = [
      candidate({ id: "full", activeLeadCount: 10, maxActiveLeads: 10 }),
      candidate({ id: "open", activeLeadCount: 3, maxActiveLeads: 10 }),
    ];
    const result = selectEmployeeForLead(candidates, "LOWEST_WORKLOAD", rentLead);
    expect(result.employeeId).toBe("open");
  });

  it("returns null with a capacity-specific reason when every candidate is full", () => {
    const candidates = [candidate({ id: "a", activeLeadCount: 5, maxActiveLeads: 5 }), candidate({ id: "b", activeLeadCount: 8, maxActiveLeads: 8 })];
    const result = selectEmployeeForLead(candidates, "LOWEST_WORKLOAD", rentLead);
    expect(result.employeeId).toBeNull();
    expect(result.reason).toMatch(/capacity/i);
  });

  it("returns null with a no-match reason when there are no candidates at all", () => {
    const result = selectEmployeeForLead([], "LOWEST_WORKLOAD", rentLead);
    expect(result.employeeId).toBeNull();
    expect(result.reason).toMatch(/no available/i);
  });
});

describe("selectEmployeeForLead - LOWEST_WORKLOAD strategy", () => {
  it("picks the candidate with the fewest active leads", () => {
    const candidates = [candidate({ id: "busy", activeLeadCount: 8 }), candidate({ id: "free", activeLeadCount: 2 }), candidate({ id: "mid", activeLeadCount: 5 })];
    const result = selectEmployeeForLead(candidates, "LOWEST_WORKLOAD", rentLead);
    expect(result.employeeId).toBe("free");
  });

  it("breaks ties deterministically by id", () => {
    const candidates = [candidate({ id: "b", activeLeadCount: 2 }), candidate({ id: "a", activeLeadCount: 2 })];
    const result = selectEmployeeForLead(candidates, "LOWEST_WORKLOAD", rentLead);
    expect(result.employeeId).toBe("a");
  });
});

describe("selectEmployeeForLead - LOCATION_BASED strategy", () => {
  it("prefers an employee whose service areas include the lead's preferred location", () => {
    const candidates = [
      candidate({ id: "wrong-area", activeLeadCount: 0, serviceAreas: ["Dwarka"] }),
      candidate({ id: "right-area", activeLeadCount: 5, serviceAreas: ["Janakpuri"] }),
    ];
    const result = selectEmployeeForLead(candidates, "LOCATION_BASED", rentLead);
    expect(result.employeeId).toBe("right-area");
    expect(result.reason).toContain("Janakpuri");
  });

  it("is case-insensitive when matching localities", () => {
    const candidates = [candidate({ id: "emp", serviceAreas: ["janakpuri"] })];
    const result = selectEmployeeForLead(candidates, "LOCATION_BASED", rentLead);
    expect(result.employeeId).toBe("emp");
  });

  it("falls back to lowest workload across everyone if no one covers the locality", () => {
    const candidates = [candidate({ id: "a", activeLeadCount: 5, serviceAreas: ["Dwarka"] }), candidate({ id: "b", activeLeadCount: 1, serviceAreas: ["Rohini"] })];
    const result = selectEmployeeForLead(candidates, "LOCATION_BASED", rentLead);
    expect(result.employeeId).toBe("b");
    expect(result.reason).toMatch(/no field executive lists/i);
  });
});

describe("selectEmployeeForLead - SPECIALITY strategy", () => {
  it("matches RENT leads to RENT or ALL specialists over SALE specialists", () => {
    const candidates = [candidate({ id: "sale-only", speciality: "SALE", activeLeadCount: 0 }), candidate({ id: "rent-specialist", speciality: "RENT", activeLeadCount: 3 })];
    const result = selectEmployeeForLead(candidates, "SPECIALITY", rentLead);
    expect(result.employeeId).toBe("rent-specialist");
  });

  it("matches BUY leads to SALE specialists", () => {
    const candidates = [candidate({ id: "rent-only", speciality: "RENT" }), candidate({ id: "sale-specialist", speciality: "SALE" })];
    const result = selectEmployeeForLead(candidates, "SPECIALITY", buyLead);
    expect(result.employeeId).toBe("sale-specialist");
  });
});

describe("selectEmployeeForLead - ROUND_ROBIN strategy", () => {
  it("prefers whoever has received the fewest leads today", () => {
    const candidates = [candidate({ id: "a", todaysAssignedCount: 3 }), candidate({ id: "b", todaysAssignedCount: 0 })];
    const result = selectEmployeeForLead(candidates, "ROUND_ROBIN", rentLead);
    expect(result.employeeId).toBe("b");
  });
});
