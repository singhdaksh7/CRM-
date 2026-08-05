import { prisma } from "../prisma";
import { matchPropertiesToLead } from "../matching";
import { daysBetween } from "./rule-engine";
import { detectFollowUpTrigger, recommendFollowUpTiming } from "./followup-recommendations";
import type { Suggestion } from "./types";
import type { LeadPriority, LeadStatus, PropertyStatus, VisitStatus, VisitOutcome, DealStage, DealStatus, OwnerVerificationStatus } from "@prisma/client";

/**
 * Contextual, per-entity suggestions - deterministic, rule-based, never
 * "AI generated". Every suggestion's actionKind maps to a capability that
 * already exists in this codebase (a real tab, a real route, a real tel:
 * link, a real API endpoint); when the underlying capability genuinely
 * doesn't exist yet (e.g. there is no Deal Detail page in this release),
 * the suggestion is returned with disabled: true and an honest reason
 * instead of being wired to something fake.
 */

const NEGATIVE_TERMINAL_STATUSES: LeadStatus[] = ["CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"];

function isValidIndianPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 12 && digits.startsWith("91"));
}

export interface LeadSuggestionInput {
  leadId: string;
  phone: string;
  status: LeadStatus;
  priority: LeadPriority;
  assignedToId: string | null;
  lastContactedAt: Date | null;
  hasPendingFollowUp: boolean;
  hasOverdueFollowUp: boolean;
  matchingPropertiesCount: number;
  catalogueSentCount: number;
  hasScheduledVisit: boolean;
  clientInterestCount: number;
  requirementComplete: boolean;
  canManage: boolean;
  now?: Date;
}

export function computeLeadSuggestions(input: LeadSuggestionInput): Suggestion[] {
  if (NEGATIVE_TERMINAL_STATUSES.includes(input.status)) return [];
  const now = input.now ?? new Date();
  const suggestions: Suggestion[] = [];

  const daysSinceContact = input.lastContactedAt ? daysBetween(input.lastContactedAt, now) : null;
  if (isValidIndianPhone(input.phone)) {
    if (daysSinceContact === null || daysSinceContact >= 3) {
      suggestions.push({
        id: `lead-${input.leadId}-call-client`,
        severity: daysSinceContact === null ? "MEDIUM" : daysSinceContact >= 7 ? "HIGH" : "MEDIUM",
        title: "Call client",
        reason: daysSinceContact === null ? "This client has never been contacted." : `No contact recorded for ${daysSinceContact} days.`,
        actionLabel: "Call client",
        actionKind: "tel",
        actionTarget: `tel:${input.phone}`,
      });
    }
  } else {
    suggestions.push({
      id: `lead-${input.leadId}-call-client`,
      severity: "LOW",
      title: "Call client",
      reason: "Phone number on file looks invalid or incomplete.",
      actionLabel: "Call client",
      actionKind: "tel",
      actionTarget: `tel:${input.phone}`,
      disabled: true,
      disabledReason: "Phone number looks invalid - verify it before calling.",
    });
  }

  if (input.hasOverdueFollowUp) {
    suggestions.push({
      id: `lead-${input.leadId}-followup`,
      severity: "CRITICAL",
      title: "Create follow-up",
      reason: "An existing follow-up on this lead is overdue.",
      actionLabel: "Go to Follow-ups",
      actionKind: "tab",
      actionTarget: "followups",
    });
  } else if (!input.hasPendingFollowUp) {
    const trigger = detectFollowUpTrigger({
      visitCompletedRecently: false,
      visitMissedRecently: false,
      catalogueOpenedNoInterest: false,
      daysSinceLastContact: daysSinceContact,
      negotiationJustStarted: input.status === "NEGOTIATION",
      paymentPartial: false,
    });
    const recommendation = trigger ? recommendFollowUpTiming(trigger, now) : null;
    suggestions.push({
      id: `lead-${input.leadId}-followup`,
      severity: input.priority === "HOT" ? "HIGH" : "MEDIUM",
      title: "Create follow-up",
      reason: recommendation ? recommendation.reason : "No follow-up is currently scheduled for this lead.",
      actionLabel: recommendation ? recommendation.label : "Go to Follow-ups",
      actionKind: "tab",
      actionTarget: "followups",
    });
  }

  if (input.matchingPropertiesCount === 0) {
    suggestions.push({
      id: `lead-${input.leadId}-rerun-matching`,
      severity: "MEDIUM",
      title: "Re-run matching",
      reason: "No matching properties are currently available for this requirement.",
      actionLabel: "Open matching",
      actionKind: "href",
      actionTarget: `/leads/${input.leadId}/match`,
    });
  }

  if (input.matchingPropertiesCount > 0 && input.catalogueSentCount === 0) {
    suggestions.push({
      id: `lead-${input.leadId}-send-catalogue`,
      severity: "MEDIUM",
      title: "Send catalogue",
      reason: `${input.matchingPropertiesCount} matching propert${input.matchingPropertiesCount > 1 ? "ies are" : "y is"} available but nothing has been shared yet.`,
      actionLabel: "Go to Catalogues",
      actionKind: "tab",
      actionTarget: "catalogues",
    });
  }

  if (!input.hasScheduledVisit && (input.clientInterestCount > 0 || input.status === "PROPERTIES_SHARED" || input.status === "QUALIFIED")) {
    suggestions.push({
      id: `lead-${input.leadId}-schedule-visit`,
      severity: input.clientInterestCount > 0 ? "HIGH" : "LOW",
      title: "Schedule visit",
      reason: input.clientInterestCount > 0 ? "Client marked interest but no visit is scheduled." : "Lead has progressed but no visit is scheduled yet.",
      actionLabel: "Go to Visits",
      actionKind: "tab",
      actionTarget: "visits",
    });
  }

  if (!input.assignedToId) {
    suggestions.push({
      id: `lead-${input.leadId}-reassign`,
      severity: input.priority === "HOT" ? "HIGH" : "MEDIUM",
      title: "Reassign lead",
      reason: "Lead has no assigned employee.",
      actionLabel: "Assign employee",
      actionKind: "tab",
      actionTarget: "overview",
      disabled: !input.canManage,
      disabledReason: input.canManage ? undefined : "Requires Admin or Data Manager role.",
    });
  }

  if (!input.requirementComplete) {
    suggestions.push({
      id: `lead-${input.leadId}-complete-requirement`,
      severity: "LOW",
      title: "Complete missing requirement fields",
      reason: "BHK, furnishing preference, or budget range is missing.",
      actionLabel: "Edit requirement",
      actionKind: "href",
      actionTarget: `/leads?edit=${input.leadId}`,
      disabled: true,
      disabledReason: "No requirement-edit form is available from this view yet.",
    });
  }

  return suggestions;
}

export interface PropertySuggestionInput {
  propertyId: string;
  status: PropertyStatus;
  imageCount: number;
  hasOwner: boolean;
  ownerVerificationStatus: OwnerVerificationStatus | null;
  hasCompleteAddress: boolean;
  hasPrice: boolean;
  updatedAt: Date;
  recentLeadMatchesCount: number;
  now?: Date;
}

export function computePropertySuggestions(input: PropertySuggestionInput): Suggestion[] {
  const now = input.now ?? new Date();
  const suggestions: Suggestion[] = [];

  if (input.imageCount === 0) {
    suggestions.push({
      id: `property-${input.propertyId}-add-photos`,
      severity: "HIGH",
      title: "Add photos",
      reason: "This listing has no images.",
      actionLabel: "Edit property",
      actionKind: "href",
      actionTarget: `/properties/${input.propertyId}/edit`,
    });
  } else if (input.imageCount < 3) {
    suggestions.push({
      id: `property-${input.propertyId}-add-photos`,
      severity: "LOW",
      title: "Add more photos",
      reason: `Only ${input.imageCount} photo${input.imageCount > 1 ? "s" : ""} uploaded.`,
      actionLabel: "Edit property",
      actionKind: "href",
      actionTarget: `/properties/${input.propertyId}/edit`,
    });
  }

  const daysSinceUpdate = daysBetween(input.updatedAt, now);
  if (input.status === "AVAILABLE" && daysSinceUpdate > 30) {
    suggestions.push({
      id: `property-${input.propertyId}-confirm-availability`,
      severity: "MEDIUM",
      title: "Confirm availability",
      reason: `Listing has not been updated in ${daysSinceUpdate} days.`,
      actionLabel: "Edit property",
      actionKind: "href",
      actionTarget: `/properties/${input.propertyId}/edit`,
    });
  }

  if (!input.hasOwner || input.ownerVerificationStatus !== "VERIFIED") {
    suggestions.push({
      id: `property-${input.propertyId}-verify-owner`,
      severity: "MEDIUM",
      title: "Verify owner",
      reason: input.hasOwner ? "Owner is not yet verified." : "No owner record is linked to this listing.",
      actionLabel: "Verify owner",
      actionKind: "href",
      actionTarget: "/owners",
      disabled: true,
      disabledReason: "Owner verification has no dedicated UI yet in this release.",
    });
  }

  if (!input.hasPrice) {
    suggestions.push({
      id: `property-${input.propertyId}-review-price`,
      severity: "HIGH",
      title: "Review price",
      reason: "Price is not set for this listing type.",
      actionLabel: "Edit property",
      actionKind: "href",
      actionTarget: `/properties/${input.propertyId}/edit`,
    });
  }

  if (input.status === "AVAILABLE" && input.recentLeadMatchesCount > 0) {
    suggestions.push({
      id: `property-${input.propertyId}-share-matches`,
      severity: "LOW",
      title: "Share with matched leads",
      reason: `${input.recentLeadMatchesCount} active lead(s) currently match this property.`,
      actionLabel: "Share from lead",
      actionKind: "href",
      actionTarget: "/leads",
      disabled: true,
      disabledReason: "Bulk sharing from the property page isn't available yet - share via each lead's Catalogues tab.",
    });
  }

  if (!input.hasCompleteAddress) {
    suggestions.push({
      id: `property-${input.propertyId}-complete-fields`,
      severity: "MEDIUM",
      title: "Complete missing fields",
      reason: "Address details are incomplete.",
      actionLabel: "Edit property",
      actionKind: "href",
      actionTarget: `/properties/${input.propertyId}/edit`,
    });
  }

  return suggestions;
}

export interface VisitSuggestionInput {
  visitId: string;
  leadId: string;
  status: VisitStatus;
  outcome: VisitOutcome | null;
  visitDate: Date;
  leadStatus: LeadStatus;
  hasPendingFollowUpForLead: boolean;
  now?: Date;
}

export function computeVisitSuggestions(input: VisitSuggestionInput): Suggestion[] {
  const suggestions: Suggestion[] = [];

  if (input.status === "COMPLETED" && !input.outcome) {
    suggestions.push({
      id: `visit-${input.visitId}-record-outcome`,
      severity: "MEDIUM",
      title: "Record outcome",
      reason: "This visit is marked completed but has no recorded outcome.",
      actionLabel: "Record outcome",
      actionKind: "tab",
      actionTarget: "visits",
    });
  }

  if ((input.status === "COMPLETED" || input.status === "CLIENT_NO_SHOW") && !input.hasPendingFollowUpForLead) {
    const trigger = detectFollowUpTrigger({
      visitCompletedRecently: input.status === "COMPLETED",
      visitMissedRecently: input.status === "CLIENT_NO_SHOW",
      catalogueOpenedNoInterest: false,
      daysSinceLastContact: null,
      negotiationJustStarted: false,
      paymentPartial: false,
    });
    const recommendation = trigger ? recommendFollowUpTiming(trigger, input.now) : null;
    suggestions.push({
      id: `visit-${input.visitId}-create-followup`,
      severity: input.status === "CLIENT_NO_SHOW" ? "HIGH" : "MEDIUM",
      title: "Create follow-up",
      reason: recommendation ? recommendation.reason : "Visit is complete with no follow-up scheduled.",
      actionLabel: recommendation ? recommendation.label : "Go to Follow-ups",
      actionKind: "tab",
      actionTarget: "followups",
    });
  }

  if (input.outcome === "READY_FOR_NEGOTIATION" && input.leadStatus !== "NEGOTIATION") {
    suggestions.push({
      id: `visit-${input.visitId}-update-status`,
      severity: "HIGH",
      title: "Update lead status",
      reason: "Client is ready for negotiation but the lead status has not been updated.",
      actionLabel: "Update status",
      actionKind: "tab",
      actionTarget: "overview",
    });
  }

  if (input.outcome === "NEEDS_TIME" || input.outcome === "WANTS_ANOTHER_PROPERTY") {
    suggestions.push({
      id: `visit-${input.visitId}-schedule-another`,
      severity: "MEDIUM",
      title: "Schedule another visit",
      reason: input.outcome === "NEEDS_TIME" ? "Client needs more time before deciding." : "Client wants to see another property.",
      actionLabel: "Go to Visits",
      actionKind: "tab",
      actionTarget: "visits",
    });
  }

  return suggestions;
}

const DEAL_UI_MISSING_REASON = "No Deal Detail page exists yet in this release - the API endpoint exists, but there is no UI to trigger this action from.";

export interface DealSuggestionInput {
  dealId: string;
  leadId: string | null;
  stage: DealStage;
  status: DealStatus;
  hasPaidPayment: boolean;
  hasAgreementDocument: boolean;
  lostReason: string | null;
  updatedAt: Date;
  now?: Date;
}

const LATE_STAGES: DealStage[] = ["AGREEMENT", "TOKEN_RECEIVED", "DOCUMENTATION", "REGISTRATION"];

export function computeDealSuggestions(input: DealSuggestionInput): Suggestion[] {
  const now = input.now ?? new Date();
  const suggestions: Suggestion[] = [];

  if (input.status === "OPEN" && LATE_STAGES.includes(input.stage) && !input.hasPaidPayment) {
    suggestions.push({
      id: `deal-${input.dealId}-record-payment`,
      severity: "MEDIUM",
      title: "Record payment",
      reason: `Deal is at ${input.stage.replace(/_/g, " ")} with no payment recorded.`,
      actionLabel: "Record payment",
      actionKind: "href",
      actionTarget: `/deals/${input.dealId}`,
      disabled: true,
      disabledReason: DEAL_UI_MISSING_REASON,
    });
  }

  if (LATE_STAGES.includes(input.stage) && !input.hasAgreementDocument) {
    suggestions.push({
      id: `deal-${input.dealId}-upload-agreement`,
      severity: "MEDIUM",
      title: "Upload agreement",
      reason: "No agreement document is on file for this deal.",
      actionLabel: "Upload agreement",
      actionKind: "href",
      actionTarget: `/deals/${input.dealId}`,
      disabled: true,
      disabledReason: DEAL_UI_MISSING_REASON,
    });
  }

  const daysSinceUpdate = daysBetween(input.updatedAt, now);
  if (input.status === "OPEN" && input.stage === "NEGOTIATION" && daysSinceUpdate > 7) {
    suggestions.push({
      id: `deal-${input.dealId}-follow-up`,
      severity: "HIGH",
      title: "Follow up on negotiation",
      reason: `No activity recorded on this negotiation for ${daysSinceUpdate} days.`,
      actionLabel: input.leadId ? "Open lead" : "Follow up",
      actionKind: "href",
      actionTarget: input.leadId ? `/leads/${input.leadId}` : `/deals/${input.dealId}`,
      disabled: !input.leadId,
      disabledReason: input.leadId ? undefined : DEAL_UI_MISSING_REASON,
    });
  }

  if (input.status === "LOST" && !input.lostReason) {
    suggestions.push({
      id: `deal-${input.dealId}-record-lost-reason`,
      severity: "LOW",
      title: "Record lost reason",
      reason: "Deal is marked lost with no reason on file.",
      actionLabel: "Record lost reason",
      actionKind: "href",
      actionTarget: `/deals/${input.dealId}`,
      disabled: true,
      disabledReason: DEAL_UI_MISSING_REASON,
    });
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// Orchestration - load what each pure compute* function needs, then call it.
// Mirrors the pattern in lead-health.ts/property-health.ts.
// ---------------------------------------------------------------------------

export async function getLeadSuggestions(leadId: string, canManage: boolean): Promise<Suggestion[]> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return [];

  const [availableProperties, pendingFollowUpCount, overdueFollowUpCount, scheduledVisitCount, catalogueSentCount, clientInterestCount] = await Promise.all([
    prisma.property.findMany({ where: { organizationId: lead.organizationId, status: "AVAILABLE" } }),
    prisma.followUp.count({ where: { leadId, status: "PENDING" } }),
    prisma.followUp.count({ where: { leadId, status: "OVERDUE" } }),
    prisma.visit.count({ where: { leadId, status: { in: ["SCHEDULED", "CONFIRMED"] } } }),
    prisma.whatsAppMessage.count({ where: { conversation: { leadId }, messageType: "CATALOGUE", direction: "OUTBOUND" } }),
    prisma.catalogueInteraction.count({ where: { catalogueShare: { leadId }, type: "INTERESTED" } }),
  ]);

  const matches = matchPropertiesToLead(availableProperties, lead, 0.2);
  const requirementComplete = Boolean(lead.preferredBhk) && Boolean(lead.furnishingPref) && lead.maxBudget > lead.minBudget;

  return computeLeadSuggestions({
    leadId: lead.id,
    phone: lead.phone,
    status: lead.status,
    priority: lead.priority,
    assignedToId: lead.assignedToId,
    lastContactedAt: lead.lastContactedAt,
    hasPendingFollowUp: pendingFollowUpCount > 0,
    hasOverdueFollowUp: overdueFollowUpCount > 0,
    matchingPropertiesCount: matches.length,
    catalogueSentCount,
    hasScheduledVisit: scheduledVisitCount > 0,
    clientInterestCount,
    requirementComplete,
    canManage,
  });
}

export async function getPropertySuggestions(propertyId: string): Promise<Suggestion[]> {
  const property = await prisma.property.findUnique({ where: { id: propertyId }, include: { owner: true } });
  if (!property) return [];

  const activeLeadCount = await prisma.lead.count({
    where: {
      organizationId: property.organizationId,
      preferredLocation: { equals: property.area, mode: "insensitive" },
      requirementType: property.listingType === "RENT" ? "RENT" : "BUY",
      status: { notIn: ["CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"] },
      maxBudget: { gte: property.listingType === "RENT" ? (property.monthlyRent ?? 0) * 0.7 : (property.salePrice ?? 0) * 0.7 },
    },
  });

  const images: string[] = (() => {
    try {
      return JSON.parse(property.images || "[]");
    } catch {
      return [];
    }
  })();
  const hasPrice = property.listingType === "RENT" ? Boolean(property.monthlyRent && property.monthlyRent > 0) : Boolean(property.salePrice && property.salePrice > 0);

  return computePropertySuggestions({
    propertyId: property.id,
    status: property.status,
    imageCount: images.length,
    hasOwner: Boolean(property.ownerId || property.owner),
    ownerVerificationStatus: property.owner?.verificationStatus ?? null,
    hasCompleteAddress: Boolean(property.address?.trim() && property.area?.trim() && property.city?.trim()),
    hasPrice,
    updatedAt: property.updatedAt,
    recentLeadMatchesCount: activeLeadCount,
  });
}

/** Not mounted to any page yet - there is no Deal Detail UI in this release (see DEAL_UI_MISSING_REASON above). Exposed via GET /api/deals/[id]/suggestions for testability and for a future Deal Detail page to consume directly. */
export async function getDealSuggestions(dealId: string): Promise<Suggestion[]> {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: { payments: true, documents: true } });
  if (!deal) return [];

  const hasPaidPayment = deal.payments.some((p) => p.status === "PAID");
  const agreementCategories = new Set(["RENT_AGREEMENT", "SALE_AGREEMENT", "BROKERAGE_AGREEMENT", "DEAL_DOCUMENT"]);
  const hasAgreementDocument = deal.documents.some((d) => agreementCategories.has(d.category) && d.status === "ACTIVE" && !d.deletedAt);

  return computeDealSuggestions({
    dealId: deal.id,
    leadId: deal.leadId,
    stage: deal.stage,
    status: deal.status,
    hasPaidPayment,
    hasAgreementDocument,
    lostReason: deal.lostReason,
    updatedAt: deal.updatedAt,
  });
}
