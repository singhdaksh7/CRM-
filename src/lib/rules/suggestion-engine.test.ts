import { describe, it, expect } from "vitest";
import { computeLeadSuggestions, computePropertySuggestions, computeVisitSuggestions, computeDealSuggestions, type LeadSuggestionInput, type PropertySuggestionInput, type VisitSuggestionInput, type DealSuggestionInput } from "./suggestion-engine";

const NOW = new Date("2026-08-05T12:00:00Z");

function leadInput(overrides: Partial<LeadSuggestionInput> = {}): LeadSuggestionInput {
  return {
    leadId: "l1",
    phone: "9876543210",
    status: "CONTACTED",
    priority: "WARM",
    assignedToId: "emp1",
    lastContactedAt: NOW,
    hasPendingFollowUp: true,
    hasOverdueFollowUp: false,
    matchingPropertiesCount: 5,
    catalogueSentCount: 1,
    hasScheduledVisit: true,
    clientInterestCount: 0,
    requirementComplete: true,
    canManage: true,
    now: NOW,
    ...overrides,
  };
}

describe("computeLeadSuggestions", () => {
  it("returns no suggestions for a fully healthy, well-attended lead", () => {
    const result = computeLeadSuggestions(leadInput());
    expect(result).toEqual([]);
  });

  it("returns an empty list for terminal-status leads", () => {
    const result = computeLeadSuggestions(leadInput({ status: "CLOSED_WON", assignedToId: null, hasPendingFollowUp: false }));
    expect(result).toEqual([]);
  });

  it("suggests calling the client via a real tel: link when contact is stale", () => {
    const result = computeLeadSuggestions(leadInput({ lastContactedAt: new Date("2026-07-20T12:00:00Z") }));
    const call = result.find((s) => s.id === "lead-l1-call-client");
    expect(call).toBeDefined();
    expect(call!.actionKind).toBe("tel");
    expect(call!.actionTarget).toBe("tel:9876543210");
    expect(call!.disabled).toBeFalsy();
  });

  it("disables the call suggestion with an honest reason for an invalid phone", () => {
    const result = computeLeadSuggestions(leadInput({ phone: "123", lastContactedAt: null }));
    const call = result.find((s) => s.id === "lead-l1-call-client");
    expect(call!.disabled).toBe(true);
    expect(call!.disabledReason).toMatch(/invalid/i);
  });

  it("suggests creating a follow-up with CRITICAL severity when one is overdue", () => {
    const result = computeLeadSuggestions(leadInput({ hasOverdueFollowUp: true, hasPendingFollowUp: false }));
    const followUp = result.find((s) => s.id === "lead-l1-followup");
    expect(followUp!.severity).toBe("CRITICAL");
    expect(followUp!.actionKind).toBe("tab");
    expect(followUp!.actionTarget).toBe("followups");
  });

  it("suggests re-running matching with a real link when there are no matches", () => {
    const result = computeLeadSuggestions(leadInput({ matchingPropertiesCount: 0 }));
    const rerun = result.find((s) => s.id === "lead-l1-rerun-matching");
    expect(rerun!.actionKind).toBe("href");
    expect(rerun!.actionTarget).toBe("/leads/l1/match");
  });

  it("suggests sending a catalogue when matches exist but nothing has been sent", () => {
    const result = computeLeadSuggestions(leadInput({ matchingPropertiesCount: 3, catalogueSentCount: 0 }));
    expect(result.some((s) => s.id === "lead-l1-send-catalogue")).toBe(true);
  });

  it("suggests reassigning an unassigned lead and disables it for non-managers", () => {
    const managed = computeLeadSuggestions(leadInput({ assignedToId: null, canManage: true }));
    const unmanaged = computeLeadSuggestions(leadInput({ assignedToId: null, canManage: false }));
    expect(managed.find((s) => s.id === "lead-l1-reassign")!.disabled).toBeFalsy();
    expect(unmanaged.find((s) => s.id === "lead-l1-reassign")!.disabled).toBe(true);
  });

  it("honestly disables the requirement-completion suggestion since no edit form exists", () => {
    const result = computeLeadSuggestions(leadInput({ requirementComplete: false }));
    const complete = result.find((s) => s.id === "lead-l1-complete-requirement");
    expect(complete!.disabled).toBe(true);
    expect(complete!.disabledReason).toMatch(/no requirement-edit form/i);
  });

  it("every suggestion carries a rule id, severity, reason, and action label", () => {
    const result = computeLeadSuggestions(leadInput({ assignedToId: null, hasOverdueFollowUp: true, matchingPropertiesCount: 0 }));
    for (const s of result) {
      expect(s.id).toBeTruthy();
      expect(s.severity).toBeTruthy();
      expect(s.reason).toBeTruthy();
      expect(s.actionLabel).toBeTruthy();
    }
  });
});

function propertyInput(overrides: Partial<PropertySuggestionInput> = {}): PropertySuggestionInput {
  return {
    propertyId: "p1",
    status: "AVAILABLE",
    imageCount: 8,
    hasOwner: true,
    ownerVerificationStatus: "VERIFIED",
    hasCompleteAddress: true,
    hasPrice: true,
    updatedAt: NOW,
    recentLeadMatchesCount: 0,
    now: NOW,
    ...overrides,
  };
}

describe("computePropertySuggestions", () => {
  it("returns no suggestions for a complete, verified, fresh, priced listing", () => {
    expect(computePropertySuggestions(propertyInput())).toEqual([]);
  });

  it("suggests adding photos with HIGH severity when there are none", () => {
    const result = computePropertySuggestions(propertyInput({ imageCount: 0 }));
    const photos = result.find((s) => s.id === "property-p1-add-photos");
    expect(photos!.severity).toBe("HIGH");
    expect(photos!.actionTarget).toBe("/properties/p1/edit");
  });

  it("suggests confirming availability for a stale AVAILABLE listing", () => {
    const result = computePropertySuggestions(propertyInput({ updatedAt: new Date("2026-06-01T12:00:00Z") }));
    expect(result.some((s) => s.id === "property-p1-confirm-availability")).toBe(true);
  });

  it("honestly disables owner verification since there is no dedicated UI", () => {
    const result = computePropertySuggestions(propertyInput({ hasOwner: false, ownerVerificationStatus: null }));
    const verify = result.find((s) => s.id === "property-p1-verify-owner");
    expect(verify!.disabled).toBe(true);
  });

  it("suggests reviewing price when price is missing", () => {
    const result = computePropertySuggestions(propertyInput({ hasPrice: false }));
    expect(result.some((s) => s.id === "property-p1-review-price")).toBe(true);
  });
});

function visitInput(overrides: Partial<VisitSuggestionInput> = {}): VisitSuggestionInput {
  return {
    visitId: "v1",
    leadId: "l1",
    status: "SCHEDULED",
    outcome: null,
    visitDate: NOW,
    leadStatus: "VISIT_SCHEDULED",
    hasPendingFollowUpForLead: true,
    now: NOW,
    ...overrides,
  };
}

describe("computeVisitSuggestions", () => {
  it("returns no suggestions for a scheduled visit with a pending follow-up already in place", () => {
    expect(computeVisitSuggestions(visitInput())).toEqual([]);
  });

  it("suggests recording an outcome for a completed visit with none recorded", () => {
    const result = computeVisitSuggestions(visitInput({ status: "COMPLETED", outcome: null }));
    expect(result.some((s) => s.id === "visit-v1-record-outcome")).toBe(true);
  });

  it("suggests a follow-up with HIGH severity for a missed visit", () => {
    const result = computeVisitSuggestions(visitInput({ status: "CLIENT_NO_SHOW", hasPendingFollowUpForLead: false }));
    const followUp = result.find((s) => s.id === "visit-v1-create-followup");
    expect(followUp!.severity).toBe("HIGH");
  });

  it("suggests updating lead status when ready for negotiation but status hasn't changed", () => {
    const result = computeVisitSuggestions(visitInput({ status: "COMPLETED", outcome: "READY_FOR_NEGOTIATION", leadStatus: "VISIT_COMPLETED" }));
    expect(result.some((s) => s.id === "visit-v1-update-status")).toBe(true);
  });

  it("suggests scheduling another visit when the client needs more time", () => {
    const result = computeVisitSuggestions(visitInput({ status: "COMPLETED", outcome: "NEEDS_TIME" }));
    expect(result.some((s) => s.id === "visit-v1-schedule-another")).toBe(true);
  });
});

function dealInput(overrides: Partial<DealSuggestionInput> = {}): DealSuggestionInput {
  return {
    dealId: "d1",
    leadId: "l1",
    stage: "INQUIRY",
    status: "OPEN",
    hasPaidPayment: false,
    hasAgreementDocument: false,
    lostReason: null,
    updatedAt: NOW,
    now: NOW,
    ...overrides,
  };
}

describe("computeDealSuggestions", () => {
  it("returns no suggestions for an early-stage, fresh, open deal", () => {
    expect(computeDealSuggestions(dealInput())).toEqual([]);
  });

  it("marks record-payment as disabled with an honest reason since there is no Deal Detail page", () => {
    const result = computeDealSuggestions(dealInput({ stage: "AGREEMENT" }));
    const payment = result.find((s) => s.id === "deal-d1-record-payment");
    expect(payment!.disabled).toBe(true);
    expect(payment!.disabledReason).toMatch(/no deal detail page/i);
  });

  it("links follow-up-on-negotiation to the real lead page when a lead is attached", () => {
    const result = computeDealSuggestions(dealInput({ stage: "NEGOTIATION", updatedAt: new Date("2026-07-01T12:00:00Z") }));
    const followUp = result.find((s) => s.id === "deal-d1-follow-up");
    expect(followUp!.disabled).toBeFalsy();
    expect(followUp!.actionTarget).toBe("/leads/l1");
  });

  it("disables follow-up-on-negotiation honestly when the deal has no linked lead", () => {
    const result = computeDealSuggestions(dealInput({ stage: "NEGOTIATION", updatedAt: new Date("2026-07-01T12:00:00Z"), leadId: null }));
    const followUp = result.find((s) => s.id === "deal-d1-follow-up");
    expect(followUp!.disabled).toBe(true);
  });

  it("suggests recording a lost reason for a lost deal with none on file", () => {
    const result = computeDealSuggestions(dealInput({ status: "LOST", lostReason: null }));
    expect(result.some((s) => s.id === "deal-d1-record-lost-reason")).toBe(true);
  });
});
