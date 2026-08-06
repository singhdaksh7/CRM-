import { prisma } from "./prisma";
import { matchPropertiesToLead } from "./matching";
import { getSystemConfig } from "./system-config";
import type { FurnishingStatus, LeadPriority, LeadSource, LeadStatus } from "@prisma/client";

export interface ScoreFactor {
  label: string;
  delta: number;
  reason: string;
}

export interface ScoreResult {
  score: number;
  priority: LeadPriority;
  factors: ScoreFactor[];
}

const HIGH_QUALITY_SOURCES: LeadSource[] = ["REFERRAL", "WALK_IN", "WEBSITE"];
const MEDIUM_QUALITY_SOURCES: LeadSource[] = ["ACRES_99", "MAGICBRICKS", "HOUSING_COM"];
const PROGRESSED_STATUSES: LeadStatus[] = ["CONTACTED", "QUALIFIED", "PROPERTIES_SHARED", "VISIT_SCHEDULED", "VISIT_COMPLETED", "NEGOTIATION", "CLOSED_WON"];

export interface ScoringInput {
  phone: string;
  email: string | null;
  minBudget: number;
  maxBudget: number;
  preferredLocation: string;
  preferredBhk: number | null;
  furnishingPref: FurnishingStatus | null;
  moveInDate: Date | null;
  source: LeadSource;
  status: LeadStatus;
  lastContactedAt: Date | null;
  matchingPropertiesCount: number;
  hasScheduledVisit: boolean;
  hasOverdueFollowUp: boolean;
  budgetLooksRealistic: boolean; // false when maxBudget is far below cheapest inventory in that area
  // Phase 2B - WhatsApp + catalogue engagement
  hasWhatsAppReply: boolean;
  catalogueViewed: boolean;
  propertyInterestCount: number;
  clientRequestedVisit: boolean;
}

function isValidIndianPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 12 && digits.startsWith("91"));
}

function isValidEmail(email: string | null): boolean {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Pure, deterministic lead-scoring function - no I/O, fully unit-testable.
 * `hotThreshold` (default 70, matching the previous hardcoded value) is
 * System Configuration's `hotLeadThreshold` - see src/lib/system-config.ts.
 * The WARM/COLD boundary (40) is not independently configurable.
 */
export function computeLeadScore(input: ScoringInput, hotThreshold = 70): ScoreResult {
  const factors: ScoreFactor[] = [];

  if (isValidIndianPhone(input.phone)) {
    factors.push({ label: "Phone number", delta: 10, reason: "Complete, valid phone number" });
  } else {
    factors.push({ label: "Phone number", delta: -40, reason: "Phone number looks invalid or incomplete" });
  }

  if (isValidEmail(input.email)) {
    factors.push({ label: "Email", delta: 5, reason: "Valid email provided" });
  }

  const budgetSpread = input.maxBudget - input.minBudget;
  if (input.minBudget > 0 && input.maxBudget > input.minBudget && budgetSpread > 0) {
    factors.push({ label: "Budget clarity", delta: 10, reason: "Clear minimum and maximum budget provided" });
  } else {
    factors.push({ label: "Budget clarity", delta: -5, reason: "Budget range is missing or unclear" });
  }

  if (input.preferredLocation?.trim()) {
    factors.push({ label: "Location clarity", delta: 10, reason: `Clear preferred location: ${input.preferredLocation}` });
  }

  if (input.moveInDate) {
    const daysUntilMoveIn = Math.ceil((input.moveInDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntilMoveIn <= 7) {
      factors.push({ label: "Move-in urgency", delta: 20, reason: "Wants to move in within 7 days" });
    } else if (daysUntilMoveIn <= 30) {
      factors.push({ label: "Move-in urgency", delta: 10, reason: "Wants to move in within 30 days" });
    }
  }

  let completeness = 0;
  if (input.preferredBhk) completeness += 5;
  if (input.furnishingPref) completeness += 5;
  if (completeness > 0) factors.push({ label: "Requirement completeness", delta: completeness, reason: "BHK and/or furnishing preference specified" });

  if (HIGH_QUALITY_SOURCES.includes(input.source)) {
    factors.push({ label: "Source quality", delta: 10, reason: `${input.source.replace(/_/g, " ")} leads convert well historically` });
  } else if (MEDIUM_QUALITY_SOURCES.includes(input.source)) {
    factors.push({ label: "Source quality", delta: 5, reason: `${input.source.replace(/_/g, " ")} is a reasonably reliable source` });
  }

  if (input.matchingPropertiesCount > 5) {
    factors.push({ label: "Inventory match", delta: 10, reason: `${input.matchingPropertiesCount} matching properties currently available` });
  } else if (input.matchingPropertiesCount >= 1) {
    factors.push({ label: "Inventory match", delta: 5, reason: `${input.matchingPropertiesCount} matching properties currently available` });
  } else {
    factors.push({ label: "Inventory match", delta: -10, reason: "No matching properties currently in inventory" });
  }

  if (!input.budgetLooksRealistic) {
    factors.push({ label: "Budget realism", delta: -10, reason: "Budget appears well below available inventory for this locality" });
  }

  if (input.hasScheduledVisit) {
    factors.push({ label: "Visit intent", delta: 10, reason: "Has a scheduled or completed property visit" });
  }

  if (input.lastContactedAt) {
    factors.push({ label: "Engagement", delta: 5, reason: "Has been contacted at least once" });
  }
  if (PROGRESSED_STATUSES.includes(input.status)) {
    factors.push({ label: "Pipeline progress", delta: 5, reason: `Lead has progressed to ${input.status.replace(/_/g, " ")}` });
  }

  if (input.hasOverdueFollowUp) {
    factors.push({ label: "Follow-up risk", delta: -15, reason: "Has an overdue follow-up with no response" });
  }

  if (input.hasWhatsAppReply) {
    factors.push({ label: "WhatsApp engagement", delta: 10, reason: "Client has replied on WhatsApp" });
  }
  if (input.catalogueViewed) {
    factors.push({ label: "Catalogue engagement", delta: 5, reason: "Client viewed a shared property catalogue" });
  }
  if (input.propertyInterestCount > 0) {
    factors.push({ label: "Property interest", delta: Math.min(15, input.propertyInterestCount * 8), reason: `Client marked ${input.propertyInterestCount} propert${input.propertyInterestCount > 1 ? "ies" : "y"} as interested` });
  }
  if (input.clientRequestedVisit) {
    factors.push({ label: "Client-initiated visit request", delta: 15, reason: "Client requested a visit through the catalogue" });
  }

  const rawScore = factors.reduce((sum, f) => sum + f.delta, 0);
  const score = Math.max(0, Math.min(100, rawScore));
  const priority: LeadPriority = score >= hotThreshold ? "HOT" : score >= 40 ? "WARM" : "COLD";

  return { score, priority, factors };
}

/** Orchestration: loads everything computeLeadScore needs from the DB, persists the result + history row. */
export async function recalculateLeadScore(leadId: string, trigger: string): Promise<ScoreResult> {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });

  const [config, availableProperties, visitCount, overdueFollowUpCount, inboundMessageCount, catalogueViewCount, propertyInterestCount, visitRequestCount] = await Promise.all([
    getSystemConfig(lead.organizationId),
    prisma.property.findMany({ where: { organizationId: lead.organizationId, status: "AVAILABLE" } }),
    prisma.visit.count({ where: { leadId } }),
    prisma.followUp.count({ where: { leadId, status: "OVERDUE" } }),
    prisma.whatsAppMessage.count({ where: { conversation: { leadId }, direction: "INBOUND" } }),
    prisma.catalogueInteraction.count({ where: { catalogueShare: { leadId }, type: "VIEWED" } }),
    prisma.catalogueInteraction.count({ where: { catalogueShare: { leadId }, type: "INTERESTED" } }),
    prisma.catalogueInteraction.count({ where: { catalogueShare: { leadId }, type: "VISIT_REQUESTED" } }),
  ]);

  const matches = matchPropertiesToLead(availableProperties, lead, config.matchingBudgetTolerancePct / 100);

  const localityProperties = availableProperties.filter(
    (p) => p.area.toLowerCase() === lead.preferredLocation.toLowerCase() && p.listingType === (lead.requirementType === "RENT" ? "RENT" : "SALE")
  );
  const cheapestLocal = localityProperties.length
    ? Math.min(...localityProperties.map((p) => (p.listingType === "RENT" ? p.monthlyRent ?? Infinity : p.salePrice ?? Infinity)))
    : null;
  const budgetLooksRealistic = cheapestLocal === null || lead.maxBudget >= cheapestLocal * 0.7;

  const result = computeLeadScore({
    phone: lead.phone,
    email: lead.email,
    minBudget: lead.minBudget,
    maxBudget: lead.maxBudget,
    preferredLocation: lead.preferredLocation,
    preferredBhk: lead.preferredBhk,
    furnishingPref: lead.furnishingPref,
    moveInDate: lead.moveInDate,
    source: lead.source,
    status: lead.status,
    lastContactedAt: lead.lastContactedAt,
    matchingPropertiesCount: matches.length,
    hasScheduledVisit: visitCount > 0,
    hasOverdueFollowUp: overdueFollowUpCount > 0,
    budgetLooksRealistic,
    hasWhatsAppReply: inboundMessageCount > 0,
    catalogueViewed: catalogueViewCount > 0,
    propertyInterestCount,
    clientRequestedVisit: visitRequestCount > 0,
  }, config.hotLeadThreshold);

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: leadId },
      data: {
        score: result.score,
        priority: result.priority,
        scoreExplanation: JSON.stringify(result.factors),
        scoreUpdatedAt: new Date(),
      },
    }),
    prisma.leadScoreHistory.create({
      data: {
        organizationId: lead.organizationId,
        leadId,
        score: result.score,
        priority: result.priority,
        factors: JSON.stringify(result.factors),
        trigger,
      },
    }),
  ]);

  return result;
}
