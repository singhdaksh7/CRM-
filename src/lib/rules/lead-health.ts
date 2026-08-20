import { prisma } from "../prisma";
import { matchPropertiesToLead } from "../matching";
import { cached } from "../cache";
import { getSystemConfig } from "../system-config";
import { buildHealthScore, daysBetween } from "./rule-engine";
import type { HealthFactor, HealthLabel, HealthScoreResult } from "./types";
import type { LeadStatus } from "@prisma/client";

/**
 * Lead Health measures *current operational health* of a lead - is someone
 * actively working it, is it stalled, does it have inventory to offer.
 * This is deliberately separate from src/lib/scoring.ts's computeLeadScore,
 * which measures lead *quality* (source, budget clarity, urgency) and is
 * never modified or replaced here. A lead can have a high quality score and
 * a low health score (great lead, going stale) or vice versa.
 */
export interface LeadHealthInput {
  status: LeadStatus;
  assignedToId: string | null;
  phone: string;
  preferredBhk: number | null;
  furnishingPref: string | null;
  minBudget: number;
  maxBudget: number;
  createdAt: Date;
  updatedAt: Date;
  lastContactedAt: Date | null;
  matchingPropertiesCount: number;
  hasPendingFollowUp: boolean;
  hasOverdueFollowUp: boolean;
  hasScheduledVisit: boolean;
  hasMissedVisit: boolean;
  catalogueSentCount: number;
  catalogueViewedCount: number;
  clientInterestCount: number;
  failedWhatsAppCount: number;
  /** Phase 4 - Field Operations: structured visit feedback signals. */
  recentFeedbackRejectionCount: number;
  recentFeedbackPositiveCount: number;
  hasNegotiationRequiredFeedback: boolean;
  now?: Date;
}

const TERMINAL_STATUSES: LeadStatus[] = ["CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"];

function isValidIndianPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 12 && digits.startsWith("91"));
}

/**
 * Pure, deterministic - no I/O, fully unit-testable.
 * `staleLeadDays` (default 14, matching the previous hardcoded value)
 * is System Configuration's `staleLeadDays` - see src/lib/system-config.ts.
 * "Going quiet" always fires at half that threshold.
 */
export function computeLeadHealth(input: LeadHealthInput, staleLeadDays = 14): HealthScoreResult {
  const now = input.now ?? new Date();
  const factors: HealthFactor[] = [];

  const requirementComplete = Boolean(input.preferredBhk) && Boolean(input.furnishingPref) && input.maxBudget > input.minBudget;
  if (requirementComplete) {
    factors.push({ label: "Requirement complete", delta: 8, detail: "BHK, furnishing and budget range are all specified" });
  } else {
    factors.push({ label: "Requirement incomplete", delta: -8, detail: "Requirement is missing BHK, furnishing preference or a clear budget range" });
  }

  if (isValidIndianPhone(input.phone)) {
    factors.push({ label: "Valid phone", delta: 4, detail: "Valid phone number on file" });
  } else {
    factors.push({ label: "Invalid phone", delta: -15, detail: "Phone number looks invalid or incomplete" });
  }

  if (input.assignedToId) {
    factors.push({ label: "Assigned", delta: 8, detail: "Assigned to an employee" });
  } else {
    factors.push({ label: "Unassigned", delta: -15, detail: "Lead is unassigned - assign an employee" });
  }

  if (input.matchingPropertiesCount > 5) {
    factors.push({ label: "Inventory match", delta: 12, detail: `${input.matchingPropertiesCount} matching properties currently available` });
  } else if (input.matchingPropertiesCount >= 1) {
    factors.push({ label: "Inventory match", delta: 6, detail: `${input.matchingPropertiesCount} matching properties currently available` });
  } else {
    factors.push({ label: "No inventory match", delta: -12, detail: "No matching properties currently available - re-run matching or widen requirement" });
  }

  if (input.hasOverdueFollowUp) {
    factors.push({ label: "Follow-up overdue", delta: -18, detail: "This lead has an overdue follow-up - call or message the client" });
  } else if (input.hasPendingFollowUp) {
    factors.push({ label: "Follow-up scheduled", delta: 8, detail: "A follow-up is scheduled" });
  }

  if (input.hasMissedVisit) {
    factors.push({ label: "Visit missed", delta: -15, detail: "A scheduled visit was missed - reschedule or follow up" });
  } else if (input.hasScheduledVisit) {
    factors.push({ label: "Visit scheduled", delta: 8, detail: "A property visit is scheduled" });
  }

  if (input.catalogueSentCount > 0 && input.catalogueViewedCount === 0) {
    factors.push({ label: "Catalogue not opened", delta: -8, detail: "A catalogue was sent but the client has not opened it yet" });
  } else if (input.catalogueViewedCount > 0 && input.clientInterestCount === 0) {
    factors.push({ label: "Catalogue opened, no reply", delta: -6, detail: "Client opened the catalogue but has not marked interest - send a follow-up" });
  } else if (input.catalogueViewedCount > 0) {
    factors.push({ label: "Catalogue engagement", delta: 6, detail: "Client opened a shared catalogue" });
  }

  if (input.clientInterestCount > 0) {
    factors.push({ label: "Client interested", delta: Math.min(15, input.clientInterestCount * 8), detail: `Client marked ${input.clientInterestCount} propert${input.clientInterestCount > 1 ? "ies" : "y"} as interested` });
  }

  if (input.status === "NEGOTIATION") {
    factors.push({ label: "Negotiation started", delta: 10, detail: "Lead has reached negotiation" });
  }

  if (input.failedWhatsAppCount >= 2) {
    factors.push({ label: "WhatsApp delivery failing", delta: -10, detail: `${input.failedWhatsAppCount} WhatsApp messages failed to send - verify the phone number` });
  }

  // Phase 4 - Field Operations: structured visit feedback signals
  if (input.recentFeedbackRejectionCount > 0) {
    factors.push({ label: "Feedback indicates rejection", delta: -12, detail: `${input.recentFeedbackRejectionCount} recent visit(s) had feedback marking family or owner rejection` });
  }
  if (input.recentFeedbackPositiveCount > 0) {
    factors.push({ label: "Positive visit feedback", delta: 8, detail: `${input.recentFeedbackPositiveCount} recent visit(s) with feedback indicating they'll visit again` });
  }
  if (input.hasNegotiationRequiredFeedback) {
    factors.push({ label: "Negotiation required per feedback", delta: 6, detail: "Recent visit feedback flagged negotiation as required" });
  }

  const daysSinceContact = input.lastContactedAt ? daysBetween(input.lastContactedAt, now) : daysBetween(input.createdAt, now);
  const goingQuietDays = Math.floor(staleLeadDays / 2);
  if (!TERMINAL_STATUSES.includes(input.status)) {
    if (daysSinceContact > staleLeadDays) {
      factors.push({ label: "Stale lead", delta: -15, detail: `No client contact recorded for ${daysSinceContact} days` });
    } else if (daysSinceContact > goingQuietDays) {
      factors.push({ label: "Going quiet", delta: -8, detail: `No client contact recorded for ${daysSinceContact} days` });
    } else if (input.lastContactedAt) {
      factors.push({ label: "Recent activity", delta: 6, detail: "Client was contacted recently" });
    }

    const daysInStatus = daysBetween(input.updatedAt, now);
    if (daysInStatus > 21 && input.status !== "NEW") {
      factors.push({ label: "Stuck in status", delta: -10, detail: `Lead has been in "${input.status.replace(/_/g, " ")}" for ${daysInStatus} days with no status change` });
    }
  }

  const fallback = TERMINAL_STATUSES.includes(input.status)
    ? null
    : "Lead is in good health - no action needed right now.";

  return buildHealthScore(factors, 50, fallback);
}

/** Orchestration: loads what computeLeadHealth needs and returns the result. Read-only, org-scoped to the caller's organizationId. */
export async function getLeadHealth(leadId: string, organizationId: string): Promise<HealthScoreResult | null> {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId } });
  if (!lead) return null;

  const [config, availableProperties, pendingFollowUpCount, overdueFollowUpCount, scheduledVisitCount, missedVisitCount, catalogueSentCount, catalogueViewedCount, clientInterestCount, failedWhatsAppCount, feedback] = await Promise.all([
    getSystemConfig(lead.organizationId),
    prisma.property.findMany({ where: { organizationId: lead.organizationId, status: "AVAILABLE" } }),
    prisma.followUp.count({ where: { leadId, status: "PENDING" } }),
    prisma.followUp.count({ where: { leadId, status: "OVERDUE" } }),
    prisma.visit.count({ where: { leadId, status: { in: ["SCHEDULED", "CONFIRMED"] } } }),
    prisma.visit.count({ where: { leadId, status: "CLIENT_NO_SHOW" } }),
    prisma.whatsAppMessage.count({ where: { conversation: { leadId }, messageType: "CATALOGUE", direction: "OUTBOUND" } }),
    prisma.catalogueInteraction.count({ where: { catalogueShare: { leadId }, type: "VIEWED" } }),
    prisma.catalogueInteraction.count({ where: { catalogueShare: { leadId }, type: "INTERESTED" } }),
    prisma.whatsAppMessage.count({ where: { conversation: { leadId }, direction: "OUTBOUND", status: "FAILED" } }),
    // Phase 4 - structured visit feedback for this lead's visits.
    prisma.visitFeedback.findMany({ where: { visit: { leadId } }, select: { familyRejected: true, ownerRejected: true, willVisitAgain: true, negotiationRequired: true } }),
  ]);

  const matches = matchPropertiesToLead(availableProperties, lead, 0.2);

  return computeLeadHealth({
    status: lead.status,
    assignedToId: lead.assignedToId,
    phone: lead.phone,
    preferredBhk: lead.preferredBhk,
    furnishingPref: lead.furnishingPref,
    minBudget: lead.minBudget,
    maxBudget: lead.maxBudget,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    lastContactedAt: lead.lastContactedAt,
    matchingPropertiesCount: matches.length,
    hasPendingFollowUp: pendingFollowUpCount > 0,
    hasOverdueFollowUp: overdueFollowUpCount > 0,
    hasScheduledVisit: scheduledVisitCount > 0,
    hasMissedVisit: missedVisitCount > 0,
    catalogueSentCount,
    catalogueViewedCount,
    clientInterestCount,
    failedWhatsAppCount,
    recentFeedbackRejectionCount: feedback.filter((f) => f.familyRejected || f.ownerRejected).length,
    recentFeedbackPositiveCount: feedback.filter((f) => f.willVisitAgain).length,
    hasNegotiationRequiredFeedback: feedback.some((f) => f.negotiationRequired),
  }, config.staleLeadDays);
}

const OVERVIEW_LEAD_LIMIT = 200;

/**
 * Dashboard-scale health distribution across active leads. Bounded to
 * OVERVIEW_LEAD_LIMIT leads and a fixed, small number of groupBy queries
 * (never one query per lead) so this stays cheap regardless of pipeline
 * size. The one difference from getLeadHealth's per-lead result: the
 * "matching properties" factor is omitted here, since computing the full
 * matching algorithm for up to 200 leads on every dashboard load does not
 * scale - see getLeadHealth for the exact per-lead score.
 */
export async function getLeadHealthOverview(organizationId: string, assignedToId?: string): Promise<{ label: HealthLabel; count: number }[]> {
  return cached(`lead-health-overview:${organizationId}:${assignedToId ?? "all"}`, 60, () => computeLeadHealthOverview(organizationId, assignedToId));
}

async function computeLeadHealthOverview(organizationId: string, assignedToId?: string): Promise<{ label: HealthLabel; count: number }[]> {
  const config = await getSystemConfig(organizationId);
  const leads = await prisma.lead.findMany({
    where: {
      organizationId,
      status: { notIn: ["CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"] },
      ...(assignedToId ? { assignedToId } : {}),
    },
    select: { id: true, status: true, assignedToId: true, phone: true, preferredBhk: true, furnishingPref: true, minBudget: true, maxBudget: true, createdAt: true, updatedAt: true, lastContactedAt: true },
    take: OVERVIEW_LEAD_LIMIT,
  });
  if (leads.length === 0) return [];

  const leadIds = leads.map((l) => l.id);
  const [followUpGroups, visitGroups, catalogueSentGroups, catalogueInteractionGroups, whatsappFailGroups, feedbackRows] = await Promise.all([
    prisma.followUp.groupBy({ by: ["leadId", "status"], where: { leadId: { in: leadIds } }, _count: true }),
    prisma.visit.groupBy({ by: ["leadId", "status"], where: { leadId: { in: leadIds } }, _count: true }),
    prisma.whatsAppMessage.groupBy({ by: ["conversationId"], where: { conversation: { leadId: { in: leadIds } }, messageType: "CATALOGUE", direction: "OUTBOUND" }, _count: true }),
    prisma.catalogueInteraction.groupBy({ by: ["catalogueShareId", "type"], where: { catalogueShare: { leadId: { in: leadIds } } }, _count: true }),
    prisma.whatsAppMessage.groupBy({ by: ["conversationId"], where: { conversation: { leadId: { in: leadIds } }, direction: "OUTBOUND", status: "FAILED" }, _count: true }),
    // Phase 4 - one bulk query, bucketed in-memory below (never one query per lead).
    prisma.visitFeedback.findMany({ where: { visit: { leadId: { in: leadIds } } }, select: { familyRejected: true, ownerRejected: true, willVisitAgain: true, negotiationRequired: true, visit: { select: { leadId: true } } } }),
  ]);

  // conversationId/catalogueShareId -> leadId lookups so the grouped rows above can be re-keyed by lead.
  const [conversations, catalogueShares] = await Promise.all([
    prisma.whatsAppConversation.findMany({ where: { leadId: { in: leadIds } }, select: { id: true, leadId: true } }),
    prisma.catalogueShare.findMany({ where: { leadId: { in: leadIds } }, select: { id: true, leadId: true } }),
  ]);
  const conversationToLead = new Map(conversations.map((c) => [c.id, c.leadId]));
  const catalogueShareToLead = new Map(catalogueShares.map((c) => [c.id, c.leadId]));

  const pendingByLead = new Map<string, number>();
  const overdueByLead = new Map<string, number>();
  for (const g of followUpGroups) {
    const map = g.status === "OVERDUE" ? overdueByLead : g.status === "PENDING" ? pendingByLead : null;
    if (map) map.set(g.leadId!, (map.get(g.leadId!) ?? 0) + g._count);
  }

  const scheduledVisitByLead = new Map<string, number>();
  const missedVisitByLead = new Map<string, number>();
  for (const g of visitGroups) {
    if (g.status === "SCHEDULED" || g.status === "CONFIRMED") scheduledVisitByLead.set(g.leadId, (scheduledVisitByLead.get(g.leadId) ?? 0) + g._count);
    if (g.status === "CLIENT_NO_SHOW") missedVisitByLead.set(g.leadId, (missedVisitByLead.get(g.leadId) ?? 0) + g._count);
  }

  const catalogueSentByLead = new Map<string, number>();
  for (const g of catalogueSentGroups) {
    const leadId = g.conversationId ? conversationToLead.get(g.conversationId) : undefined;
    if (leadId) catalogueSentByLead.set(leadId, (catalogueSentByLead.get(leadId) ?? 0) + g._count);
  }

  const catalogueViewedByLead = new Map<string, number>();
  const clientInterestByLead = new Map<string, number>();
  for (const g of catalogueInteractionGroups) {
    const leadId = catalogueShareToLead.get(g.catalogueShareId);
    if (!leadId) continue;
    if (g.type === "VIEWED") catalogueViewedByLead.set(leadId, (catalogueViewedByLead.get(leadId) ?? 0) + g._count);
    if (g.type === "INTERESTED") clientInterestByLead.set(leadId, (clientInterestByLead.get(leadId) ?? 0) + g._count);
  }

  const failedWhatsAppByLead = new Map<string, number>();
  for (const g of whatsappFailGroups) {
    const leadId = g.conversationId ? conversationToLead.get(g.conversationId) : undefined;
    if (leadId) failedWhatsAppByLead.set(leadId, (failedWhatsAppByLead.get(leadId) ?? 0) + g._count);
  }

  // Phase 4 - structured visit feedback, bucketed per lead.
  const feedbackRejectionByLead = new Map<string, number>();
  const feedbackPositiveByLead = new Map<string, number>();
  const negotiationRequiredByLead = new Set<string>();
  for (const f of feedbackRows) {
    const leadId = f.visit.leadId;
    if (f.familyRejected || f.ownerRejected) feedbackRejectionByLead.set(leadId, (feedbackRejectionByLead.get(leadId) ?? 0) + 1);
    if (f.willVisitAgain) feedbackPositiveByLead.set(leadId, (feedbackPositiveByLead.get(leadId) ?? 0) + 1);
    if (f.negotiationRequired) negotiationRequiredByLead.add(leadId);
  }

  const counts = new Map<HealthLabel, number>();
  for (const lead of leads) {
    const result = computeLeadHealth({
      status: lead.status,
      assignedToId: lead.assignedToId,
      phone: lead.phone,
      preferredBhk: lead.preferredBhk,
      furnishingPref: lead.furnishingPref,
      minBudget: lead.minBudget,
      maxBudget: lead.maxBudget,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
      lastContactedAt: lead.lastContactedAt,
      matchingPropertiesCount: 1, // neutral placeholder - see doc comment above
      hasPendingFollowUp: (pendingByLead.get(lead.id) ?? 0) > 0,
      hasOverdueFollowUp: (overdueByLead.get(lead.id) ?? 0) > 0,
      hasScheduledVisit: (scheduledVisitByLead.get(lead.id) ?? 0) > 0,
      hasMissedVisit: (missedVisitByLead.get(lead.id) ?? 0) > 0,
      catalogueSentCount: catalogueSentByLead.get(lead.id) ?? 0,
      catalogueViewedCount: catalogueViewedByLead.get(lead.id) ?? 0,
      clientInterestCount: clientInterestByLead.get(lead.id) ?? 0,
      failedWhatsAppCount: failedWhatsAppByLead.get(lead.id) ?? 0,
      recentFeedbackRejectionCount: feedbackRejectionByLead.get(lead.id) ?? 0,
      recentFeedbackPositiveCount: feedbackPositiveByLead.get(lead.id) ?? 0,
      hasNegotiationRequiredFeedback: negotiationRequiredByLead.has(lead.id),
    }, config.staleLeadDays);
    counts.set(result.label, (counts.get(result.label) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([label, count]) => ({ label, count }));
}
