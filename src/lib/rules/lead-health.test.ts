import { describe, it, expect } from "vitest";
import { computeLeadHealth, type LeadHealthInput } from "./lead-health";

const NOW = new Date("2026-08-05T12:00:00Z");

function baseInput(overrides: Partial<LeadHealthInput> = {}): LeadHealthInput {
  return {
    status: "CONTACTED",
    assignedToId: "emp1",
    phone: "9876543210",
    preferredBhk: 2,
    furnishingPref: "SEMI_FURNISHED",
    minBudget: 20000,
    maxBudget: 30000,
    createdAt: new Date("2026-07-20T12:00:00Z"),
    updatedAt: new Date("2026-08-01T12:00:00Z"),
    lastContactedAt: new Date("2026-08-04T12:00:00Z"),
    matchingPropertiesCount: 6,
    hasPendingFollowUp: true,
    hasOverdueFollowUp: false,
    hasScheduledVisit: true,
    hasMissedVisit: false,
    catalogueSentCount: 0,
    catalogueViewedCount: 0,
    clientInterestCount: 0,
    failedWhatsAppCount: 0,
    now: NOW,
    ...overrides,
  };
}

describe("computeLeadHealth", () => {
  it("scores a healthy, active, well-inventoried lead as Healthy or Excellent", () => {
    const result = computeLeadHealth(baseInput());
    expect(["Healthy", "Excellent"]).toContain(result.label);
    expect(result.warnings.length).toBe(0);
  });

  it("penalizes an overdue follow-up and recommends acting on it", () => {
    const healthy = computeLeadHealth(baseInput());
    const overdue = computeLeadHealth(baseInput({ hasOverdueFollowUp: true, hasPendingFollowUp: false }));
    expect(overdue.score).toBeLessThan(healthy.score);
    expect(overdue.recommendedAction).toMatch(/overdue/i);
  });

  it("penalizes an unassigned lead", () => {
    const assigned = computeLeadHealth(baseInput());
    const unassigned = computeLeadHealth(baseInput({ assignedToId: null }));
    expect(unassigned.score).toBeLessThan(assigned.score);
    expect(unassigned.warnings.some((w) => /unassigned/i.test(w.detail))).toBe(true);
  });

  it("penalizes a lead with no matching properties", () => {
    const withMatches = computeLeadHealth(baseInput());
    const noMatches = computeLeadHealth(baseInput({ matchingPropertiesCount: 0 }));
    expect(noMatches.score).toBeLessThan(withMatches.score);
    expect(noMatches.warnings.some((w) => /no matching properties/i.test(w.detail))).toBe(true);
  });

  it("flags a catalogue sent but not opened", () => {
    const result = computeLeadHealth(baseInput({ catalogueSentCount: 1, catalogueViewedCount: 0 }));
    expect(result.warnings.some((w) => /not opened/i.test(w.detail))).toBe(true);
  });

  it("rewards client interest recorded via a catalogue", () => {
    const result = computeLeadHealth(baseInput({ catalogueViewedCount: 1, clientInterestCount: 2 }));
    expect(result.positives.some((p) => /marked 2 propert/i.test(p.detail))).toBe(true);
  });

  it("flags a stale lead with no recent contact", () => {
    const active = computeLeadHealth(baseInput());
    const stale = computeLeadHealth(baseInput({ lastContactedAt: new Date("2026-07-01T12:00:00Z") }));
    expect(stale.warnings.some((w) => /no client contact/i.test(w.detail))).toBe(true);
    expect(stale.score).toBeLessThan(active.score);
  });

  it("flags an incomplete requirement", () => {
    const result = computeLeadHealth(baseInput({ preferredBhk: null, furnishingPref: null }));
    expect(result.warnings.some((w) => /requirement/i.test(w.detail))).toBe(true);
  });

  it("clamps the score to 0-100 for a lead with every possible negative factor", () => {
    const result = computeLeadHealth(
      baseInput({
        assignedToId: null,
        phone: "123",
        preferredBhk: null,
        furnishingPref: null,
        matchingPropertiesCount: 0,
        hasOverdueFollowUp: true,
        hasPendingFollowUp: false,
        hasScheduledVisit: false,
        hasMissedVisit: true,
        catalogueSentCount: 1,
        catalogueViewedCount: 0,
        failedWhatsAppCount: 5,
        lastContactedAt: new Date("2026-01-01T12:00:00Z"),
        createdAt: new Date("2026-01-01T12:00:00Z"),
        updatedAt: new Date("2026-01-01T12:00:00Z"),
      })
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.label).toBe("Critical");
  });

  it("clamps the score to 0-100 for a lead with every possible positive factor", () => {
    const result = computeLeadHealth(
      baseInput({
        status: "NEGOTIATION",
        matchingPropertiesCount: 10,
        catalogueViewedCount: 3,
        clientInterestCount: 3,
        lastContactedAt: NOW,
      })
    );
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("does not apply the stale/stuck-status penalties to terminal statuses", () => {
    const result = computeLeadHealth(
      baseInput({ status: "CLOSED_LOST", lastContactedAt: new Date("2026-01-01T12:00:00Z"), updatedAt: new Date("2026-01-01T12:00:00Z") })
    );
    expect(result.warnings.some((w) => /no client contact/i.test(w.detail))).toBe(false);
    expect(result.warnings.some((w) => /stuck in/i.test(w.detail))).toBe(false);
  });
});
