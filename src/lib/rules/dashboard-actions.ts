import { prisma } from "../prisma";
import { cached } from "../cache";
import { resolveOrganizationIdForUser } from "../organization";
import { makeRule, sortRulesBySeverity } from "./rule-engine";
import type { RuleResult } from "./types";
import type { Role } from "@prisma/client";

/**
 * Dashboard Action Center: a prioritized, explainable list of things that
 * need a human's attention right now, computed straight from existing
 * tables. Every rule is capped with `take` so this never turns into an
 * unbounded read as data grows, and every result carries the reason it
 * fired plus a deep link to act on it.
 */
const ACTION_CENTER_CACHE_TTL_SECONDS = 30;
const PER_RULE_LIMIT = 15;

async function safe(label: string, fn: () => Promise<RuleResult[]>): Promise<RuleResult[]> {
  try {
    return await fn();
  } catch (err) {
    console.error(JSON.stringify({
      level: "error",
      event: "action_center_rule_failed",
      rule: label,
      message: err instanceof Error ? err.message : String(err),
    }));
    return [];
  }
}

export async function getActionCenterItems(role: Role, userId: string): Promise<RuleResult[]> {
  const organizationId = await resolveOrganizationIdForUser(userId);
  return cached(`action-center:${organizationId}:${role}:${userId}`, ACTION_CENTER_CACHE_TTL_SECONDS, () =>
    computeActionCenterItems(organizationId, role, userId)
  );
}

async function computeActionCenterItems(organizationId: string, role: Role, userId: string): Promise<RuleResult[]> {
  const scopedUserId = role === "FIELD_EXECUTIVE" ? userId : undefined;
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const staleCutoff = new Date(now);
  staleCutoff.setDate(staleCutoff.getDate() - 30);
  const catalogueQuietCutoff = new Date(now);
  catalogueQuietCutoff.setHours(catalogueQuietCutoff.getHours() - 24);
  const documentExpiryCutoff = new Date(now);
  documentExpiryCutoff.setDate(documentExpiryCutoff.getDate() + 14);
  const whatsappFailureCutoff = new Date(now);
  whatsappFailureCutoff.setDate(whatsappFailureCutoff.getDate() - 3);
  const negotiationStaleCutoff = new Date(now.getTime() - 7 * 86400000);
  const oldNoMatchCutoff = new Date(now.getTime() - 7 * 86400000);

  const groups = await Promise.all([
    safe("overdueFollowUps", () => overdueFollowUpRules(organizationId, scopedUserId)),
    safe("hotLeadsNoFollowUp", () => hotLeadsNoFollowUpRules(organizationId, scopedUserId)),
    safe("catalogueOpenedNoResponse", () => catalogueOpenedNoResponseRules(organizationId, scopedUserId, catalogueQuietCutoff)),
    safe("unassignedHotLeads", () => unassignedHotLeadRules(organizationId)),
    safe("visitsToday", () => visitsTodayRules(organizationId, scopedUserId, startOfToday, endOfToday)),
    safe("missedVisits", () => missedVisitRules(organizationId, scopedUserId, now)),
    safe("propertiesWithoutImages", () => propertiesWithoutImagesRules(organizationId)),
    safe("staleAvailability", () => staleAvailabilityRules(organizationId, staleCutoff)),
    safe("unavailableAfterShare", () => propertyUnavailableAfterShareRules(organizationId)),
    safe("dealsAwaitingPayment", () => dealsAwaitingPaymentRules(organizationId, scopedUserId)),
    safe("paymentsOverdue", () => paymentsOverdueRules(organizationId, now)),
    safe("documentsExpiring", () => documentsExpiringRules(organizationId, now, documentExpiryCutoff)),
    safe("failedWhatsApp", () => failedWhatsAppRules(organizationId, whatsappFailureCutoff)),
    safe("whatsappInbox", () => whatsappInboxRules(organizationId, scopedUserId)),
    safe("newMatchRecommendations", () => newMatchRecommendationRules(organizationId, scopedUserId)),
    safe("staleNegotiations", () => staleNegotiationRules(organizationId, scopedUserId, negotiationStaleCutoff)),
    safe("oldNoMatchRequirements", () => oldNoMatchRequirementRules(organizationId, scopedUserId, oldNoMatchCutoff)),
    safe("portalOperations", () => portalOperationRules(organizationId, role, now)),
  ]);

  return sortRulesBySeverity(groups.flat());
}

async function portalOperationRules(organizationId: string, role: Role, now: Date): Promise<RuleResult[]> {
  if (role === "FIELD_EXECUTIVE") return [];
  const [unassigned, ambiguous, failed, conflicts, degraded, stale] = await Promise.all([
    prisma.externalLeadEvent.count({ where: { organizationId, ingestionStatus: "RECEIVED", lead: { is: { assignedToId: null } } } }),
    prisma.externalLeadEvent.count({ where: { organizationId, ingestionStatus: { in: ["AMBIGUOUS", "NEEDS_REVIEW"] } } }),
    prisma.externalLeadEvent.count({ where: { organizationId, ingestionStatus: "FAILED" } }),
    prisma.portalListing.count({ where: { organizationId, status: "SYNC_CONFLICT" } }),
    prisma.propertyPortalConnection.count({ where: { organizationId, status: { in: ["DEGRADED", "AUTH_FAILED"] } } }),
    prisma.portalOperation.count({ where: { organizationId, status: "RETRYABLE", lastAttemptAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } }),
  ]);
  const specs: Array<[string, number, string, string, string]> = [["portal-unassigned", unassigned, "Portal leads need assignment", "New portal enquiries remain unassigned.", "/leads/portal?status=RECEIVED"], ["portal-ambiguous", ambiguous, "Ambiguous portal leads need review", "The CRM will not silently merge possible matches.", "/leads/portal?status=AMBIGUOUS"], ["portal-failed", failed, "Failed portal ingestion needs retry", "Review the authorized event before retrying.", "/leads/portal?status=FAILED"], ["portal-conflicts", conflicts, "Listing sync conflicts need review", "CRM remains the default source of truth until resolved.", "/integrations/property-portals"], ["portal-degraded", degraded, "Provider connection degraded", "Inspect configuration and last safe error.", "/integrations/property-portals"], ["portal-stale", stale, "Stale failed portal operation", "Manual retry is bounded and never calls a provider automatically.", "/integrations/property-portals"]];
  return specs.filter(([, count]) => count > 0).map(([id, count, title, description, href]) => makeRule({ id, category: "SYSTEM", severity: "HIGH", title: `${count} ${title.toLowerCase()}`, description, reason: "Portal actions only navigate to human review; they never call providers.", entityType: "PORTAL", entityId: id, actionLabel: "Review portal work", actionHref: href }));
}

async function whatsappInboxRules(organizationId: string, userId?: string): Promise<RuleResult[]> {
  const scope = { organizationId, ...(userId ? { assignedToId: userId } : {}) };
  const [unread, unknown, failed, followUps] = await Promise.all([
    prisma.whatsAppConversation.count({ where: { ...scope, unreadCount: { gt: 0 } } }),
    prisma.whatsAppConversation.count({ where: { ...scope, contactState: { in: ["UNKNOWN", "AMBIGUOUS"] } } }),
    prisma.whatsAppMessage.count({ where: { organizationId, status: "FAILED", direction: "OUTBOUND", ...(userId ? { conversation: { assignedToId: userId } } : {}) } }),
    prisma.followUp.count({ where: { organizationId, type: "WHATSAPP", status: { in: ["PENDING", "OVERDUE"] }, ...(userId ? { ownerId: userId } : {}) } }),
  ]);
  const rows: RuleResult[] = [];
  if (unread) rows.push(makeRule({ id: "whatsapp-unread", category: "LEAD", severity: "HIGH", title: `${unread} unread WhatsApp conversation${unread === 1 ? "" : "s"}`, description: "Clients are waiting for a human response.", reason: "Inbound messages remain unread in the CRM inbox.", entityType: "WHATSAPP", entityId: "inbox", actionLabel: "Open inbox", actionHref: "/whatsapp?filter=unread" }));
  if (unknown) rows.push(makeRule({ id: "whatsapp-unknown", category: "LEAD", severity: "HIGH", title: `${unknown} unknown contact${unknown === 1 ? " needs" : "s need"} linking`, description: "Inbound contacts have not been linked to a lead.", reason: "The CRM never guesses ambiguous or unknown lead matches.", entityType: "WHATSAPP", entityId: "unknown", actionLabel: "Review contacts", actionHref: "/whatsapp?filter=unknown" }));
  if (failed) rows.push(makeRule({ id: "whatsapp-failed-summary", category: "LEAD", severity: "HIGH", title: `${failed} failed message${failed === 1 ? "" : "s"} need retry`, description: "Manual review is required before retrying.", reason: "WhatsApp retries are never automatic.", entityType: "WHATSAPP", entityId: "failed", actionLabel: "Open inbox", actionHref: "/whatsapp" }));
  if (followUps) rows.push(makeRule({ id: "whatsapp-followups", category: "FOLLOW_UP", severity: "MEDIUM", title: `${followUps} lead${followUps === 1 ? "" : "s"} awaiting WhatsApp follow-up`, description: "Scheduled WhatsApp follow-ups need employee action.", reason: "Follow-up recommendations never send a client message automatically.", entityType: "WHATSAPP", entityId: "followups", actionLabel: "Review follow-ups", actionHref: "/follow-ups" }));
  return rows;
}

async function newMatchRecommendationRules(organizationId: string, userId?: string): Promise<RuleResult[]> {
  const rows = await prisma.lead.findMany({ where: { organizationId, matchRecommendations: { some: { status: "PENDING" } }, ...(userId ? { assignedToId: userId } : {}) }, select: { id: true, clientName: true, _count: { select: { matchRecommendations: { where: { status: "PENDING" } } } } }, take: PER_RULE_LIMIT });
  return rows.map(l => makeRule({ id: `new-matches-${l.id}`, category: "LEAD", severity: "HIGH", title: "New matching inventory", description: `${l.clientName} has ${l._count.matchRecommendations} new propert${l._count.matchRecommendations === 1 ? "y" : "ies"} not yet reviewed`, reason: "New inventory matched this active requirement and has not been shared.", entityType: "LEAD", entityId: l.id, actionLabel: "Review matches", actionHref: `/leads/${l.id}` }));
}

async function staleNegotiationRules(organizationId: string, userId: string | undefined, cutoff: Date): Promise<RuleResult[]> {
  const rows = await prisma.deal.findMany({ where: { organizationId, status: "OPEN", stage: "NEGOTIATION", updatedAt: { lt: cutoff }, ...(userId ? { assignedToId: userId } : {}) }, select: { id: true, dealCode: true, updatedAt: true }, take: PER_RULE_LIMIT });
  return rows.map(d => makeRule({ id: `stale-negotiation-${d.id}`, category: "DEAL", severity: "HIGH", title: "Negotiation needs follow-up", description: `${d.dealCode} has had no update since ${d.updatedAt.toLocaleDateString("en-IN")}`, reason: "Open negotiation has been inactive for more than seven days.", entityType: "DEAL", entityId: d.id, actionLabel: "Open negotiation", actionHref: `/deals/${d.id}` }));
}

async function oldNoMatchRequirementRules(organizationId: string, userId: string | undefined, cutoff: Date): Promise<RuleResult[]> {
  const notifications = await prisma.notification.findMany({ where: { organizationId, type: "NO_MATCHES_FOUND", createdAt: { lt: cutoff }, leadId: { not: null } }, select: { leadId: true }, distinct: ["leadId"], take: PER_RULE_LIMIT });
  const leadIds = notifications.flatMap(n => n.leadId ? [n.leadId] : []);
  const rows = await prisma.lead.findMany({ where: { id: { in: leadIds }, organizationId, status: { notIn: ["CLOSED_WON", "CLOSED_LOST", "INVALID"] }, ...(userId ? { assignedToId: userId } : {}) }, select: { id: true, clientName: true }, take: PER_RULE_LIMIT });
  return rows.map(r => makeRule({ id: `old-no-match-${r.id}`, category: "LEAD", severity: "MEDIUM", title: "Requirement still has no match", description: `${r.clientName} has waited more than seven days for inventory`, reason: "The requirement should be reviewed or broadcast to inventory partners.", entityType: "LEAD", entityId: r.id, actionLabel: "Open requirement", actionHref: "/requirements" }));
}

async function overdueFollowUpRules(organizationId: string, userId?: string): Promise<RuleResult[]> {
  const rows = await prisma.followUp.findMany({
    where: { organizationId, status: "OVERDUE", leadId: { not: null }, ...(userId ? { ownerId: userId } : {}) },
    include: { lead: { select: { clientName: true } } },
    orderBy: { dueDate: "asc" },
    take: PER_RULE_LIMIT,
  });
  return rows
    .filter((f) => f.lead)
    .map((f) =>
      makeRule({
        id: `followup-overdue-${f.id}`,
        category: "FOLLOW_UP",
        severity: "CRITICAL",
        title: "Follow-up overdue",
        description: `${f.type.replace(/_/g, " ")} follow-up for ${f.lead!.clientName} was due ${f.dueDate.toLocaleDateString("en-IN")}`,
        reason: "This follow-up's due date has passed with no completion recorded.",
        entityType: "LEAD",
        entityId: f.leadId!,
        actionLabel: "Open lead",
        actionHref: `/leads/${f.leadId}`,
      })
    );
}

async function hotLeadsNoFollowUpRules(organizationId: string, userId?: string): Promise<RuleResult[]> {
  const rows = await prisma.lead.findMany({
    where: {
      organizationId,
      priority: "HOT",
      status: { notIn: ["CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"] },
      nextFollowUpAt: null,
      followUps: { none: { status: { in: ["PENDING", "OVERDUE"] } } },
      ...(userId ? { assignedToId: userId } : {}),
    },
    select: { id: true, clientName: true },
    take: PER_RULE_LIMIT,
  });
  return rows.map((l) =>
    makeRule({
      id: `hot-lead-no-followup-${l.id}`,
      category: "LEAD",
      severity: "HIGH",
      title: "Hot lead has no follow-up",
      description: `${l.clientName} is a hot lead with no follow-up scheduled`,
      reason: "High-priority leads with no scheduled follow-up risk going cold.",
      entityType: "LEAD",
      entityId: l.id,
      actionLabel: "Schedule follow-up",
      actionHref: `/leads/${l.id}`,
    })
  );
}

async function catalogueOpenedNoResponseRules(organizationId: string, userId?: string, quietSince?: Date): Promise<RuleResult[]> {
  const rows = await prisma.catalogueShare.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      viewCount: { gt: 0 },
      lastViewedAt: { lte: quietSince },
      interactions: { none: { type: { in: ["INTERESTED", "VISIT_REQUESTED"] } } },
      ...(userId ? { lead: { assignedToId: userId } } : {}),
    },
    include: { lead: { select: { id: true, clientName: true } } },
    orderBy: { lastViewedAt: "asc" },
    take: PER_RULE_LIMIT,
  });
  return rows.map((c) =>
    makeRule({
      id: `catalogue-quiet-${c.id}`,
      category: "CATALOGUE",
      severity: "MEDIUM",
      title: "Catalogue opened but no response",
      description: `${c.lead.clientName} opened "${c.title}" but has not responded`,
      reason: "The client viewed the shared catalogue but has not marked any interest or requested a visit.",
      entityType: "LEAD",
      entityId: c.leadId,
      actionLabel: "Follow up",
      actionHref: `/leads/${c.leadId}`,
    })
  );
}

async function unassignedHotLeadRules(organizationId: string): Promise<RuleResult[]> {
  const rows = await prisma.lead.findMany({
    where: { organizationId, assignedToId: null, priority: "HOT", status: { notIn: ["CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"] } },
    select: { id: true, clientName: true },
    take: PER_RULE_LIMIT,
  });
  return rows.map((l) =>
    makeRule({
      id: `unassigned-hot-lead-${l.id}`,
      category: "LEAD",
      severity: "CRITICAL",
      title: "Unassigned hot lead",
      description: `${l.clientName} is a hot lead with no assigned employee`,
      reason: "High-priority leads should be assigned promptly to avoid losing the client.",
      entityType: "LEAD",
      entityId: l.id,
      actionLabel: "Assign lead",
      actionHref: `/leads/${l.id}`,
    })
  );
}

async function visitsTodayRules(organizationId: string, userId: string | undefined, start: Date, end: Date): Promise<RuleResult[]> {
  const rows = await prisma.visit.findMany({
    where: { organizationId, status: { in: ["SCHEDULED", "CONFIRMED"] }, visitDate: { gte: start, lte: end }, ...(userId ? { assignedToId: userId } : {}) },
    include: { lead: { select: { clientName: true } }, property: { select: { title: true } } },
    orderBy: { visitTime: "asc" },
    take: PER_RULE_LIMIT,
  });
  return rows.map((v) =>
    makeRule({
      id: `visit-today-${v.id}`,
      category: "VISIT",
      severity: "INFO",
      title: "Visit scheduled today",
      description: `${v.lead.clientName} - ${v.property.title} at ${v.visitTime}`,
      reason: "This visit is scheduled for today.",
      entityType: "VISIT",
      entityId: v.id,
      actionLabel: "View visit",
      actionHref: `/visits/${v.id}`,
    })
  );
}

async function missedVisitRules(organizationId: string, userId: string | undefined, now: Date): Promise<RuleResult[]> {
  const rows = await prisma.visit.findMany({
    where: {
      organizationId,
      OR: [{ status: "CLIENT_NO_SHOW" }, { status: "SCHEDULED", visitDate: { lt: now } }],
      ...(userId ? { assignedToId: userId } : {}),
    },
    include: { lead: { select: { clientName: true, id: true } }, property: { select: { title: true } } },
    orderBy: { visitDate: "desc" },
    take: PER_RULE_LIMIT,
  });
  return rows.map((v) =>
    makeRule({
      id: `visit-missed-${v.id}`,
      category: "VISIT",
      severity: "HIGH",
      title: "Missed visit needs follow-up",
      description: `${v.lead.clientName} - ${v.property.title} visit was missed`,
      reason: v.status === "CLIENT_NO_SHOW" ? "Client did not show up for this visit." : "Visit date has passed without an outcome recorded.",
      entityType: "LEAD",
      entityId: v.lead.id,
      actionLabel: "Create follow-up",
      actionHref: `/leads/${v.lead.id}`,
    })
  );
}

async function propertiesWithoutImagesRules(organizationId: string): Promise<RuleResult[]> {
  const rows = await prisma.property.findMany({
    where: { organizationId, status: "AVAILABLE", images: "[]" },
    select: { id: true, title: true, propertyCode: true },
    take: PER_RULE_LIMIT,
  });
  return rows.map((p) =>
    makeRule({
      id: `property-no-images-${p.id}`,
      category: "PROPERTY",
      severity: "LOW",
      title: "Property has no photos",
      description: `${p.propertyCode} - ${p.title} has no images`,
      reason: "Listings without photos get fewer shares and client interest.",
      entityType: "PROPERTY",
      entityId: p.id,
      actionLabel: "Add images",
      actionHref: `/properties/${p.id}`,
    })
  );
}

async function staleAvailabilityRules(organizationId: string, cutoff: Date): Promise<RuleResult[]> {
  const rows = await prisma.property.findMany({
    where: { organizationId, status: "AVAILABLE", updatedAt: { lt: cutoff } },
    select: { id: true, title: true, propertyCode: true, updatedAt: true },
    orderBy: { updatedAt: "asc" },
    take: PER_RULE_LIMIT,
  });
  return rows.map((p) =>
    makeRule({
      id: `property-stale-${p.id}`,
      category: "PROPERTY",
      severity: "MEDIUM",
      title: "Availability needs confirmation",
      description: `${p.propertyCode} - ${p.title} has not been updated in over 30 days`,
      reason: "Long-untouched listings risk being unavailable without the CRM reflecting it.",
      entityType: "PROPERTY",
      entityId: p.id,
      actionLabel: "Confirm availability",
      actionHref: `/properties/${p.id}`,
    })
  );
}

async function propertyUnavailableAfterShareRules(organizationId: string): Promise<RuleResult[]> {
  const rows = await prisma.property.findMany({
    where: {
      organizationId,
      status: { not: "AVAILABLE" },
      catalogueShareProperties: { some: { catalogueShare: { status: "ACTIVE" } } },
    },
    select: { id: true, title: true, propertyCode: true, status: true },
    take: PER_RULE_LIMIT,
  });
  return rows.map((p) =>
    makeRule({
      id: `property-unavailable-after-share-${p.id}`,
      category: "PROPERTY",
      severity: "HIGH",
      title: "Shared property became unavailable",
      description: `${p.propertyCode} - ${p.title} is now ${p.status.toLowerCase()} but is still in an active catalogue`,
      reason: "Clients may still be viewing this property in a live catalogue after it stopped being available.",
      entityType: "PROPERTY",
      entityId: p.id,
      actionLabel: "Review listing",
      actionHref: `/properties/${p.id}`,
    })
  );
}

async function dealsAwaitingPaymentRules(organizationId: string, userId?: string): Promise<RuleResult[]> {
  const rows = await prisma.deal.findMany({
    where: {
      organizationId,
      status: "OPEN",
      stage: { in: ["AGREEMENT", "TOKEN_RECEIVED", "DOCUMENTATION", "REGISTRATION"] },
      payments: { none: { status: "PAID" } },
      ...(userId ? { assignedToId: userId } : {}),
    },
    select: { id: true, dealCode: true, stage: true },
    take: PER_RULE_LIMIT,
  });
  return rows.map((d) =>
    makeRule({
      id: `deal-awaiting-payment-${d.id}`,
      category: "DEAL",
      severity: "MEDIUM",
      title: "Deal waiting for payment",
      description: `${d.dealCode} is at ${d.stage.replace(/_/g, " ")} with no payment recorded`,
      reason: "Deals in later stages with no recorded payment need a payment follow-up.",
      entityType: "DEAL",
      entityId: d.id,
      actionLabel: "Record payment",
      actionHref: `/deals/${d.id}`,
    })
  );
}

async function paymentsOverdueRules(organizationId: string, now: Date): Promise<RuleResult[]> {
  const rows = await prisma.payment.findMany({
    where: { organizationId, OR: [{ status: "OVERDUE" }, { status: "PENDING", dueDate: { lt: now } }] },
    include: { deal: { select: { dealCode: true } } },
    orderBy: { dueDate: "asc" },
    take: PER_RULE_LIMIT,
  });
  return rows.map((p) =>
    makeRule({
      id: `payment-overdue-${p.id}`,
      category: "PAYMENT",
      severity: "CRITICAL",
      title: "Payment overdue",
      description: `Payment of ₹${p.amount.toLocaleString("en-IN")} for ${p.deal.dealCode} is overdue`,
      reason: "This payment's due date has passed without being marked paid.",
      entityType: "DEAL",
      entityId: p.dealId,
      actionLabel: "Review payment",
      actionHref: `/deals/${p.dealId}`,
    })
  );
}

async function documentsExpiringRules(organizationId: string, now: Date, cutoff: Date): Promise<RuleResult[]> {
  const rows = await prisma.document.findMany({
    where: { organizationId, status: "ACTIVE", deletedAt: null, expiresAt: { gte: now, lte: cutoff } },
    select: { id: true, fileName: true, expiresAt: true, entityType: true, leadId: true, propertyId: true, ownerId: true, dealId: true },
    orderBy: { expiresAt: "asc" },
    take: PER_RULE_LIMIT,
  });
  return rows.map((d) => {
    const entityId = d.leadId ?? d.propertyId ?? d.ownerId ?? d.dealId ?? "";
    const href = d.leadId ? `/leads/${d.leadId}` : d.propertyId ? `/properties/${d.propertyId}` : d.dealId ? `/deals/${d.dealId}` : "/documents";
    return makeRule({
      id: `document-expiring-${d.id}`,
      category: "SYSTEM",
      severity: "MEDIUM",
      title: "Document expiring soon",
      description: `${d.fileName} expires ${d.expiresAt!.toLocaleDateString("en-IN")}`,
      reason: "This document is within 14 days of its expiry date.",
      entityType: d.entityType,
      entityId,
      actionLabel: "Review document",
      actionHref: href,
    });
  });
}

async function failedWhatsAppRules(organizationId: string, since: Date): Promise<RuleResult[]> {
  const rows = await prisma.whatsAppMessage.findMany({
    where: { organizationId, direction: "OUTBOUND", status: "FAILED", createdAt: { gte: since } },
    include: { conversation: { select: { leadId: true, lead: { select: { clientName: true } } } } },
    orderBy: { createdAt: "desc" },
    take: PER_RULE_LIMIT,
  });
  return rows
    .filter((m) => m.conversation?.leadId)
    .map((m) =>
      makeRule({
        id: `whatsapp-failed-${m.id}`,
        category: "LEAD",
        severity: "HIGH",
        title: "WhatsApp message failed",
        description: `A message to ${m.conversation!.lead!.clientName} failed to send${m.errorMessage ? `: ${m.errorMessage}` : ""}`,
        reason: "Delivery failure may mean the client is not receiving updates.",
        entityType: "LEAD",
        entityId: m.conversation!.leadId!,
        actionLabel: "Open conversation",
        actionHref: `/leads/${m.conversation!.leadId}`,
      })
    );
}
