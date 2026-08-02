import { describe, it, expect } from "vitest";
import { computeLeadScore, type ScoringInput } from "./scoring";

function baseInput(overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    phone: "+919876543210",
    email: "client@example.com",
    minBudget: 15000,
    maxBudget: 20000,
    preferredLocation: "Janakpuri",
    preferredBhk: 2,
    furnishingPref: "SEMI_FURNISHED",
    moveInDate: null,
    source: "WEBSITE",
    status: "NEW",
    lastContactedAt: null,
    matchingPropertiesCount: 3,
    hasScheduledVisit: false,
    hasOverdueFollowUp: false,
    budgetLooksRealistic: true,
    hasWhatsAppReply: false,
    catalogueViewed: false,
    propertyInterestCount: 0,
    clientRequestedVisit: false,
    ...overrides,
  };
}

describe("computeLeadScore - priority mapping", () => {
  it("maps score >= 70 to HOT", () => {
    const result = computeLeadScore(
      baseInput({
        moveInDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // within 7 days: +20
        matchingPropertiesCount: 8, // +10
        source: "REFERRAL", // +10
        hasScheduledVisit: true, // +10
      })
    );
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.priority).toBe("HOT");
  });

  it("maps a mid-range score to WARM", () => {
    const result = computeLeadScore(baseInput());
    expect(result.priority).toBe(result.score >= 70 ? "HOT" : result.score >= 40 ? "WARM" : "COLD");
  });

  it("maps a heavily penalised score to COLD", () => {
    const result = computeLeadScore(
      baseInput({
        phone: "123", // invalid: -40
        matchingPropertiesCount: 0, // -10
        budgetLooksRealistic: false, // -10
        hasOverdueFollowUp: true, // -15
        email: null,
        preferredBhk: null,
        furnishingPref: null,
      })
    );
    expect(result.priority).toBe("COLD");
  });
});

describe("computeLeadScore - individual factors", () => {
  it("penalises an invalid phone number heavily", () => {
    const valid = computeLeadScore(baseInput());
    const invalid = computeLeadScore(baseInput({ phone: "123" }));
    expect(invalid.score).toBeLessThan(valid.score);
    expect(invalid.factors.some((f) => f.label === "Phone number" && f.delta < 0)).toBe(true);
  });

  it("rewards move-in within 7 days more than within 30 days", () => {
    const within7 = computeLeadScore(baseInput({ moveInDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) }));
    const within30 = computeLeadScore(baseInput({ moveInDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000) }));
    const none = computeLeadScore(baseInput({ moveInDate: null }));
    expect(within7.score).toBeGreaterThan(within30.score);
    expect(within30.score).toBeGreaterThan(none.score);
  });

  it("never returns a score below 0 or above 100", () => {
    const min = computeLeadScore(baseInput({ phone: "1", matchingPropertiesCount: 0, budgetLooksRealistic: false, hasOverdueFollowUp: true, minBudget: 0, maxBudget: 0, preferredLocation: "" }));
    expect(min.score).toBeGreaterThanOrEqual(0);

    const max = computeLeadScore(
      baseInput({ moveInDate: new Date(), matchingPropertiesCount: 20, source: "REFERRAL", hasScheduledVisit: true, lastContactedAt: new Date(), status: "NEGOTIATION" })
    );
    expect(max.score).toBeLessThanOrEqual(100);
  });

  it("penalises an overdue follow-up", () => {
    const withOverdue = computeLeadScore(baseInput({ hasOverdueFollowUp: true }));
    const without = computeLeadScore(baseInput({ hasOverdueFollowUp: false }));
    expect(withOverdue.score).toBeLessThan(without.score);
  });
});

describe("computeLeadScore - Phase 2B WhatsApp/catalogue engagement factors", () => {
  it("rewards a WhatsApp reply", () => {
    const withReply = computeLeadScore(baseInput({ hasWhatsAppReply: true }));
    const without = computeLeadScore(baseInput({ hasWhatsAppReply: false }));
    expect(withReply.score).toBeGreaterThan(without.score);
    expect(withReply.factors.some((f) => f.label === "WhatsApp engagement")).toBe(true);
  });

  it("rewards a catalogue view", () => {
    const viewed = computeLeadScore(baseInput({ catalogueViewed: true }));
    const notViewed = computeLeadScore(baseInput({ catalogueViewed: false }));
    expect(viewed.score).toBeGreaterThan(notViewed.score);
  });

  it("rewards property interest, capped at +15", () => {
    const one = computeLeadScore(baseInput({ propertyInterestCount: 1 }));
    const many = computeLeadScore(baseInput({ propertyInterestCount: 5 }));
    const noneResult = computeLeadScore(baseInput({ propertyInterestCount: 0 }));
    expect(one.score).toBeGreaterThan(noneResult.score);
    expect(many.score - noneResult.score).toBeLessThanOrEqual(15);
  });

  it("rewards a client-initiated visit request", () => {
    const requested = computeLeadScore(baseInput({ clientRequestedVisit: true }));
    const notRequested = computeLeadScore(baseInput({ clientRequestedVisit: false }));
    expect(requested.score).toBeGreaterThan(notRequested.score);
  });
});
