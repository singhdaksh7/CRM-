import { describe, expect, it } from "vitest";
import { getNextAction } from "./lead-workspace";

type Lead = Parameters<typeof getNextAction>[0];

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead_1",
    leadCode: "LD-001",
    clientName: "Test Client",
    phone: "9999999999",
    phones: [],
    createdAt: new Date("2026-01-01"),
    status: "QUALIFIED",
    priority: "WARM",
    assignedToId: null,
    assignedTo: null,
    assignmentStrategy: null,
    assignmentReason: null,
    autoAssignedAt: null,
    score: 0,
    scoreExplanation: null,
    scoreUpdatedAt: null,
    notes: null,
    activities: [],
    followUps: [],
    visits: [],
    sharedProperties: [],
    matchRecommendations: [],
    catalogueShares: [],
    ...overrides,
  };
}

const match = { id: "match_1" } as Lead["matchRecommendations"][number];
const share = { id: "share_1", propertyIds: "[]", createdAt: new Date(), whatsappLink: "https://wa.me/" };

describe("getNextAction", () => {
  it("guides new leads to complete their requirement", () => {
    expect(getNextAction(lead({ status: "NEW" }), 0)?.label).toBe("Complete Requirement");
  });

  it("prioritizes an unresolved past visit over sharing", () => {
    expect(getNextAction(lead({
      matchRecommendations: [match],
      visits: [{ id: "visit_1", visitDate: new Date("2020-01-01"), visitTime: "10:00", status: "SCHEDULED", outcome: null, property: null, assignedTo: null, employeeNotes: null }],
    }), 0)?.label).toBe("Record Outcome");
  });

  it("suggests scheduling a visit for liked properties without a future visit", () => {
    expect(getNextAction(lead({ matchRecommendations: [match], sharedProperties: [share] }), 1)?.label).toBe("Schedule Visit");
  });

  it("guides shareable matches to an explicit share action", () => {
    expect(getNextAction(lead({ matchRecommendations: [match] }), 0)?.label).toBe("Share Properties");
  });

  it("does not imply matches exist when there are none", () => {
    expect(getNextAction(lead(), 0)?.label).toBe("No Matches Yet");
  });

  it("uses a follow-up only after more specific actions are satisfied", () => {
    expect(getNextAction(lead({ matchRecommendations: [match], sharedProperties: [share] }), 0)?.label).toBe("Follow Up");
  });

  it("does not show active-workflow guidance for closed leads", () => {
    expect(getNextAction(lead({ status: "CLOSED_WON", matchRecommendations: [match] }), 0)).toBeNull();
  });
});
