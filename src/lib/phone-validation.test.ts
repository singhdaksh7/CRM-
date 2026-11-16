import { describe, expect, it } from "vitest";
import { firstDialablePhone, hasValidIndianPhone, splitPhoneCandidates, validIndianPhones } from "./phone-validation";
import { computeLeadScore, type ScoringInput } from "./scoring";
import { computeLeadHealth } from "./rules/lead-health";
import { computeLeadSuggestions } from "./rules/suggestion-engine";

describe("hasValidIndianPhone - single stored formats", () => {
  it.each(["9506576678", "6386190983", "+919506576678", "919506576678", "09506576678", "+91 95065 76678", "95065-76678"])("accepts %s", (p) => {
    expect(hasValidIndianPhone([p])).toBe(true);
  });
  it.each(["12345", "98765", "abcdefghij", "", "5506576678", "+91 12345"])("rejects %j", (p) => {
    expect(hasValidIndianPhone([p])).toBe(false);
  });
  it("rejects empty / null fields", () => {
    expect(hasValidIndianPhone([])).toBe(false);
    expect(hasValidIndianPhone([null, undefined, ""])).toBe(false);
  });
});

describe("composed 'A / B' values are split, never validated as one string", () => {
  it("splits on / , ; | and whitespace-separated pairs", () => {
    expect(splitPhoneCandidates("6386190983 / 9506576678")).toEqual(["6386190983", "9506576678"]);
    expect(splitPhoneCandidates("6386190983, 9506576678")).toEqual(["6386190983", "9506576678"]);
    expect(splitPhoneCandidates("6386190983 9506576678")).toEqual(["6386190983", "9506576678"]);
    expect(splitPhoneCandidates("+91 95065 76678")).toEqual(["+91 95065 76678"]);
  });
  it("validates each number and dedupes", () => {
    expect(validIndianPhones(["6386190983 / 9506576678"])).toEqual(["916386190983", "919506576678"]);
    expect(validIndianPhones(["9506576678", "+91 95065 76678"])).toEqual(["919506576678"]);
  });
  it("one good half is enough; two bad halves still fail", () => {
    expect(hasValidIndianPhone(["123 / 9506576678"])).toBe(true);
    expect(hasValidIndianPhone(["123 / 456"])).toBe(false);
  });
  it("firstDialablePhone returns a 10-digit number", () => {
    expect(firstDialablePhone(["bad", "6386190983 / 9506576678"])).toBe("6386190983");
    expect(firstDialablePhone(["bad"])).toBeNull();
  });
});

describe("multiple structured numbers", () => {
  it("valid primary + valid alternate passes", () => expect(hasValidIndianPhone(["9506576678", "6386190983"])).toBe(true));
  it("invalid primary + valid alternate still has a reachable number", () => expect(hasValidIndianPhone(["12345", "6386190983"])).toBe(true));
});

function lead00350(overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    phone: "6386190983 / 9506576678",
    email: null,
    minBudget: 15000,
    maxBudget: 20000,
    preferredLocation: "Janakpuri",
    preferredBhk: 2,
    furnishingPref: "SEMI_FURNISHED",
    moveInDate: new Date(Date.now() + 2 * 86400000),
    source: "OLX",
    status: "NEW",
    lastContactedAt: null,
    matchingPropertiesCount: 6,
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

describe("computeLeadScore - LEAD-00350 phone criterion", () => {
  it("no -40 penalty; phone is +10; every other component is unchanged", () => {
    const r = computeLeadScore(lead00350());
    const phone = r.factors.find((f) => f.label === "Phone number")!;
    expect(phone.delta).toBe(10);
    expect(phone.reason).toBe("Complete, valid phone number");
    expect(r.factors.some((f) => f.delta === -40)).toBe(false);
    const others = Object.fromEntries(r.factors.filter((f) => f !== phone).map((f) => [f.label, f.delta]));
    expect(others).toEqual({ "Budget clarity": 10, "Location clarity": 10, "Move-in urgency": 20, "Requirement completeness": 10, "Source quality": 5, "Inventory match": 10 });
    expect(r.score).toBe(75);
  });
  it("structured alternate rescues an invalid primary", () => {
    const r = computeLeadScore(lead00350({ phone: "12345", additionalPhones: ["6386190983"] }));
    expect(r.factors.find((f) => f.label === "Phone number")!.delta).toBe(10);
  });
  it("genuinely invalid / empty phone keeps the existing -40", () => {
    for (const phone of ["12345", "abcdefghij", ""]) {
      const r = computeLeadScore(lead00350({ phone }));
      const f = r.factors.find((x) => x.label === "Phone number")!;
      expect(f.delta).toBe(-40);
      expect(f.reason).toBe("Phone number looks invalid or incomplete");
    }
  });
});

describe("health + suggestions use the same validator", () => {
  it("lead health: composed number is valid; alternate rescues invalid primary", () => {
    const base = { status: "NEW", assignedToId: "u", preferredBhk: 2, furnishingPref: "SEMI_FURNISHED", minBudget: 1, maxBudget: 2, createdAt: new Date(), updatedAt: new Date(), lastContactedAt: null, matchingPropertiesCount: 1, hasPendingFollowUp: false, hasOverdueFollowUp: false, hasScheduledVisit: false, hasMissedVisit: false, catalogueSentCount: 0, catalogueViewedCount: 0, clientInterestCount: 0, failedWhatsAppCount: 0, recentFeedbackRejectionCount: 0, recentFeedbackPositiveCount: 0, hasNegotiationRequiredFeedback: false } as const;
    expect(computeLeadHealth({ ...base, phone: "6386190983 / 9506576678" }).warnings.some((w) => w.label === "Invalid phone")).toBe(false);
    expect(computeLeadHealth({ ...base, phone: "12345", additionalPhones: ["9506576678"] }).warnings.some((w) => w.label === "Invalid phone")).toBe(false);
    expect(computeLeadHealth({ ...base, phone: "12345" }).warnings.some((w) => w.label === "Invalid phone")).toBe(true);
  });
  it("suggestions: tel: target is the first valid number, not the composed string", () => {
    const s = computeLeadSuggestions({ leadId: "l1", phone: "6386190983 / 9506576678", status: "NEW", priority: "HOT", assignedToId: null, lastContactedAt: null, hasPendingFollowUp: false, hasOverdueFollowUp: false, matchingPropertiesCount: 1, catalogueSentCount: 0, hasScheduledVisit: false, clientInterestCount: 0, requirementComplete: true, canManage: true });
    const call = s.find((x) => x.id === "lead-l1-call-client")!;
    expect(call.disabled).toBeFalsy();
    expect(call.actionTarget).toBe("tel:6386190983");
  });
});
