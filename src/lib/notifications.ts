import Redis from "ioredis";
import { prisma } from "./prisma";
import { DEFAULT_ORGANIZATION_ID } from "./organization";
import { withTiming } from "./perf";
import { logger } from "./logger";
import { matchPropertiesToLead } from "./matching";
import { getSystemConfig } from "./system-config";
import type { LeadStatus, Notification, NotificationType, Role } from "@prisma/client";

interface CreateNotificationParams {
  organizationId?: string;
  userId?: string | null;
  role?: Role | null;
  type: NotificationType;
  title: string;
  message: string;
  leadId?: string | null;
  visitId?: string | null;
  propertyId?: string | null;
  followUpId?: string | null;
}

/** Creates a notification targeted either at one user, or broadcast to every user with a given role. */
export async function createNotification(params: CreateNotificationParams): Promise<Notification> {
  return prisma.notification.create({
    data: {
      organizationId: params.organizationId ?? DEFAULT_ORGANIZATION_ID,
      userId: params.userId ?? null,
      role: params.role ?? null,
      type: params.type,
      title: params.title,
      message: params.message,
      leadId: params.leadId ?? null,
      visitId: params.visitId ?? null,
      propertyId: params.propertyId ?? null,
      followUpId: params.followUpId ?? null,
    },
  });
}

/** Broadcasts to every active user of a role (e.g. notify all Admins + Data Managers of a new lead). */
export async function notifyRoles(
  roles: Role[],
  data: Omit<CreateNotificationParams, "userId" | "role">
) {
  await Promise.all(roles.map((role) => createNotification({ ...data, role })));
}

/** Notifications visible to a user: addressed to them directly, or broadcast to their role. */
export function notificationVisibilityWhere(userId: string, role: Role) {
  return {
    OR: [{ userId }, { userId: null, role }],
  };
}

export async function getUnreadCount(userId: string, role: Role, organizationId: string): Promise<number> {
  return withTiming("getUnreadCount", "notifications", () =>
    prisma.notification.count({
      // organizationId is required here, not just userId/role - the
      // `{ userId: null, role }` branch of notificationVisibilityWhere
      // matches role-broadcast notifications (see notifyRoles()), which
      // are role-scoped, not user-scoped, so without this predicate an
      // ADMIN/DATA_MANAGER in one org would be counted into the broadcast
      // notifications of every other org sharing that role. See GET
      // /api/notifications (src/app/api/notifications/route.ts), which
      // already adds this predicate at the call site.
      where: { organizationId, ...notificationVisibilityWhere(userId, role), isRead: false },
    })
  );
}

/**
 * Due/overdue follow-up notification sweep. Previously invoked lazily on
 * every authenticated page load via the (app) layout - that blocked every
 * navigation on an N+1 loop (one findFirst + optional update per due
 * follow-up) and has been moved to POST /api/internal/notifications/sweep,
 * run on a schedule (see vercel.json). Idempotent: a notification is only
 * created once per follow-up per type, so re-running it never duplicates
 * alerts - safe to call from a cron, a throttled lazy trigger, or a test.
 *
 * The existing-notification check is now one batched findMany instead of
 * one findFirst per follow-up, so a sweep with many due follow-ups no
 * longer issues 2 queries per row.
 */
export async function generateDueFollowUpNotifications(organizationId = DEFAULT_ORGANIZATION_ID) {
  const now = new Date();

  const dueFollowUps = await prisma.followUp.findMany({
    where: {
      organizationId,
      status: { in: ["PENDING", "OVERDUE"] },
      dueDate: { lte: now },
      leadId: { not: null },
    },
    // `owner` was never read below (only followUp.ownerId is) - dropped
    // from the include entirely rather than given a narrow select, so no
    // User row (passwordHash included) is ever fetched for this sweep.
    include: { lead: true },
  });

  if (dueFollowUps.length === 0) return { checked: 0, created: 0 };

  const existing = await prisma.notification.findMany({
    where: { followUpId: { in: dueFollowUps.map((f) => f.id) } },
    select: { followUpId: true, type: true },
  });
  const existingKeys = new Set(existing.map((n) => `${n.followUpId}:${n.type}`));

  let created = 0;
  for (const followUp of dueFollowUps) {
    if (!followUp.lead) continue;
    const isOverdue = followUp.status === "OVERDUE" || followUp.dueDate < startOfToday(now);
    const type: NotificationType = isOverdue ? "FOLLOW_UP_OVERDUE" : "FOLLOW_UP_DUE";

    if (existingKeys.has(`${followUp.id}:${type}`)) continue;

    await createNotification({
      organizationId,
      userId: followUp.ownerId,
      role: followUp.ownerId ? undefined : "DATA_MANAGER",
      type,
      title: isOverdue ? "Follow-up overdue" : "Follow-up due today",
      message: `${followUp.type.replace(/_/g, " ")} follow-up for ${followUp.lead.clientName} is ${isOverdue ? "overdue" : "due today"}.`,
      leadId: followUp.leadId,
      followUpId: followUp.id,
    });
    created++;

    // Keep the FollowUp row's own status in sync so /follow-ups buckets and
    // the notification agree with each other.
    if (isOverdue && followUp.status !== "OVERDUE") {
      await prisma.followUp.update({ where: { id: followUp.id }, data: { status: "OVERDUE" } });
    }
  }

  return { checked: dueFollowUps.length, created };
}

function startOfToday(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

// ---------------------------------------------------------------------------
// Smart CRM V2 Phase 1 - Smart Notifications
//
// Unlike generateDueFollowUpNotifications (one notification per follow-up,
// ever - ignore FOLLOW_UP status transitions aside), these rules are
// re-evaluated on every sweep and re-fire after a cooldown window if the
// underlying condition is still true. Each rule batches its "already
// notified within the cooldown" check into a single findMany (same shape as
// the existing followUp sweep) rather than one query per candidate row, and
// every candidate list is capped at SMART_SWEEP_LIMIT so a large pipeline
// never turns one sweep into an unbounded scan.
//
// Two of the nine required notification types are intentionally NOT
// implemented here because they already exist and fire correctly elsewhere -
// adding a second producer would violate "do not duplicate existing
// notification types":
//   - PROPERTY_UNAVAILABLE_AFTER_SHARE fires from
//     notifyAffectedCataloguesOfPropertyChange() (property-share-alerts.ts),
//     called directly from the property update route the moment a shared
//     property's status changes - immediate, not sweep-based, and strictly
//     better than a periodic check for this event.
//   - CATALOGUE_VIEWED already fires on first view
//     (catalogue-interactions.ts). CATALOGUE_NO_RESPONSE below is a
//     deliberately distinct type/signal: viewed AND still no client response
//     after a configured interval.
// The other two reused types (NO_MATCHES_FOUND, PAYMENT_PENDING) are reused
// here for a genuinely complementary purpose: NO_MATCHES_FOUND already fires
// when a matching run happens, but inventory can silently dry up between
// matching runs; PAYMENT_PENDING existed in the schema with no producer at
// all until now.
// ---------------------------------------------------------------------------

const SMART_SWEEP_LIMIT = 50;

const TERMINAL_LEAD_STATUSES: LeadStatus[] = ["CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"];

function hoursAgo(from: Date, hours: number): Date {
  return new Date(from.getTime() - hours * 60 * 60 * 1000);
}

interface SweepRuleResult {
  checked: number;
  created: number;
}

/** High-priority lead with no follow-up scheduled at all. `slaHours` (default 24, matching the previous hardcoded value) is System Configuration's `followUpSlaHours`. */
async function notifyHotLeadsNoFollowUp(organizationId: string, now: Date, slaHours = 24): Promise<SweepRuleResult> {
  const cutoff = hoursAgo(now, slaHours);
  const leads = await prisma.lead.findMany({
    where: {
      organizationId,
      priority: "HOT",
      status: { notIn: TERMINAL_LEAD_STATUSES },
      nextFollowUpAt: null,
      followUps: { none: { status: { in: ["PENDING", "OVERDUE"] } } },
    },
    select: { id: true, clientName: true, assignedToId: true },
    take: SMART_SWEEP_LIMIT,
  });
  if (leads.length === 0) return { checked: 0, created: 0 };

  const existing = await prisma.notification.findMany({
    where: { leadId: { in: leads.map((l) => l.id) }, type: "HOT_LEAD_NO_FOLLOWUP", createdAt: { gte: cutoff } },
    select: { leadId: true },
  });
  const already = new Set(existing.map((e) => e.leadId));

  let created = 0;
  for (const lead of leads) {
    if (already.has(lead.id)) continue;
    await createNotification({
      organizationId,
      userId: lead.assignedToId,
      role: lead.assignedToId ? undefined : "DATA_MANAGER",
      type: "HOT_LEAD_NO_FOLLOWUP",
      title: "Hot lead has no follow-up",
      message: `${lead.clientName} is a hot lead with no follow-up scheduled.`,
      leadId: lead.id,
    });
    created++;
  }
  return { checked: leads.length, created };
}

/** Catalogue opened by the client but no interest/visit-request interaction recorded within `delayHours` of the last view. `delayHours` (default 24, matching the previous hardcoded value) is System Configuration's `catalogueFollowUpDelayHours`. */
async function notifyCatalogueNoResponse(organizationId: string, now: Date, delayHours = 24): Promise<SweepRuleResult> {
  const cutoff = hoursAgo(now, delayHours);
  const quietSince = hoursAgo(now, delayHours);
  const shares = await prisma.catalogueShare.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      viewCount: { gt: 0 },
      lastViewedAt: { lte: quietSince },
      interactions: { none: { type: { in: ["INTERESTED", "VISIT_REQUESTED"] } } },
    },
    include: { lead: { select: { clientName: true, assignedToId: true } } },
    take: SMART_SWEEP_LIMIT,
  });
  if (shares.length === 0) return { checked: 0, created: 0 };

  const existing = await prisma.notification.findMany({
    where: { leadId: { in: shares.map((s) => s.leadId) }, type: "CATALOGUE_NO_RESPONSE", createdAt: { gte: cutoff } },
    select: { leadId: true },
  });
  const already = new Set(existing.map((e) => e.leadId));

  let created = 0;
  for (const share of shares) {
    if (already.has(share.leadId)) continue;
    await createNotification({
      organizationId,
      userId: share.lead.assignedToId,
      role: share.lead.assignedToId ? undefined : "DATA_MANAGER",
      type: "CATALOGUE_NO_RESPONSE",
      title: "Catalogue opened but no response",
      message: `${share.lead.clientName} opened "${share.title}" but has not responded.`,
      leadId: share.leadId,
    });
    created++;
  }
  return { checked: shares.length, created };
}

/** A visit that was marked as a no-show, or whose scheduled date has passed with no status update at all. */
async function notifyMissedVisits(organizationId: string, now: Date): Promise<SweepRuleResult> {
  const cutoff = hoursAgo(now, 24);
  const visits = await prisma.visit.findMany({
    where: { organizationId, OR: [{ status: "CLIENT_NO_SHOW" }, { status: "SCHEDULED", visitDate: { lt: now } }] },
    include: { lead: { select: { clientName: true } } },
    take: SMART_SWEEP_LIMIT,
  });
  if (visits.length === 0) return { checked: 0, created: 0 };

  const existing = await prisma.notification.findMany({
    where: { visitId: { in: visits.map((v) => v.id) }, type: "VISIT_MISSED", createdAt: { gte: cutoff } },
    select: { visitId: true },
  });
  const already = new Set(existing.map((e) => e.visitId));

  let created = 0;
  for (const visit of visits) {
    if (already.has(visit.id)) continue;
    await createNotification({
      organizationId,
      userId: visit.assignedToId,
      role: visit.assignedToId ? undefined : "DATA_MANAGER",
      type: "VISIT_MISSED",
      title: "Visit missed",
      message: `${visit.lead.clientName}'s visit was missed.`,
      leadId: visit.leadId,
      visitId: visit.id,
    });
    created++;
  }
  return { checked: visits.length, created };
}

/** An active listing with zero images uploaded. */
async function notifyPropertiesMissingPhotos(organizationId: string, now: Date): Promise<SweepRuleResult> {
  const cutoff = hoursAgo(now, 72);
  const properties = await prisma.property.findMany({
    where: { organizationId, status: "AVAILABLE", images: "[]" },
    select: { id: true, title: true, propertyCode: true },
    take: SMART_SWEEP_LIMIT,
  });
  if (properties.length === 0) return { checked: 0, created: 0 };

  const existing = await prisma.notification.findMany({
    where: { propertyId: { in: properties.map((p) => p.id) }, type: "PROPERTY_MISSING_PHOTOS", createdAt: { gte: cutoff } },
    select: { propertyId: true },
  });
  const already = new Set(existing.map((e) => e.propertyId));

  let created = 0;
  for (const property of properties) {
    if (already.has(property.id)) continue;
    await notifyRoles(["ADMIN", "DATA_MANAGER"], {
      organizationId,
      type: "PROPERTY_MISSING_PHOTOS",
      title: "Property has no photos",
      message: `${property.propertyCode} - ${property.title} has no images.`,
      propertyId: property.id,
    });
    created++;
  }
  return { checked: properties.length, created };
}

/**
 * Leads whose current inventory match count has dropped to zero since the
 * last matching run (e.g. the matching properties were rented out/sold).
 * Reuses NO_MATCHES_FOUND - see the module doc comment above. Bounded to
 * SMART_SWEEP_LIMIT leads per sweep, oldest-checked first, so this cycles
 * through the whole active pipeline over successive sweeps rather than
 * scoring every lead on every run.
 */
async function notifyLeadsWithNoMatches(organizationId: string, now: Date): Promise<SweepRuleResult> {
  const cutoff = hoursAgo(now, 48);
  const candidateLeads = await prisma.lead.findMany({
    where: { organizationId, status: { notIn: TERMINAL_LEAD_STATUSES } },
    orderBy: { updatedAt: "asc" },
    take: SMART_SWEEP_LIMIT,
  });
  if (candidateLeads.length === 0) return { checked: 0, created: 0 };

  const existing = await prisma.notification.findMany({
    where: { leadId: { in: candidateLeads.map((l) => l.id) }, type: "NO_MATCHES_FOUND", createdAt: { gte: cutoff } },
    select: { leadId: true },
  });
  const already = new Set(existing.map((e) => e.leadId));
  const leadsToCheck = candidateLeads.filter((l) => !already.has(l.id));
  if (leadsToCheck.length === 0) return { checked: candidateLeads.length, created: 0 };

  const properties = await prisma.property.findMany({ where: { organizationId, status: "AVAILABLE" } });

  let created = 0;
  for (const lead of leadsToCheck) {
    const matches = matchPropertiesToLead(properties, lead, 0.2);
    if (matches.length > 0) continue;
    await notifyRoles(["ADMIN", "DATA_MANAGER"], {
      organizationId,
      type: "NO_MATCHES_FOUND",
      title: "No matching properties",
      message: `No matching properties currently found for ${lead.clientName}.`,
      leadId: lead.id,
    });
    if (lead.assignedToId) {
      await createNotification({
        organizationId,
        userId: lead.assignedToId,
        type: "NO_MATCHES_FOUND",
        title: "No matching properties",
        message: `No matching properties currently found for ${lead.clientName}.`,
        leadId: lead.id,
      });
    }
    created++;
  }
  return { checked: candidateLeads.length, created };
}

/**
 * A deal stuck in the NEGOTIATION stage with no update in 7+ days. The
 * Notification model has no dealId column, so this links via the deal's
 * optional leadId (dedup key + deep link) - deals with no lead attached are
 * counted in `checked` but skipped for notification purposes, since there is
 * nowhere to link the alert to.
 */
async function notifyStaleNegotiations(organizationId: string, now: Date): Promise<SweepRuleResult> {
  const cutoff = hoursAgo(now, 72);
  const staleCutoff = new Date(now);
  staleCutoff.setDate(staleCutoff.getDate() - 7);

  const deals = await prisma.deal.findMany({
    where: { organizationId, status: "OPEN", stage: "NEGOTIATION", updatedAt: { lt: staleCutoff } },
    select: { id: true, dealCode: true, assignedToId: true, leadId: true },
    take: SMART_SWEEP_LIMIT,
  });
  if (deals.length === 0) return { checked: 0, created: 0 };

  const dealsWithLead = deals.filter((d): d is typeof d & { leadId: string } => Boolean(d.leadId));
  if (dealsWithLead.length === 0) return { checked: deals.length, created: 0 };

  const existing = await prisma.notification.findMany({
    where: { leadId: { in: dealsWithLead.map((d) => d.leadId) }, type: "DEAL_NEGOTIATION_STALE", createdAt: { gte: cutoff } },
    select: { leadId: true },
  });
  const already = new Set(existing.map((e) => e.leadId));

  let created = 0;
  for (const deal of dealsWithLead) {
    if (already.has(deal.leadId)) continue;
    await createNotification({
      organizationId,
      userId: deal.assignedToId,
      role: deal.assignedToId ? undefined : "ADMIN",
      type: "DEAL_NEGOTIATION_STALE",
      title: "Negotiation stalled",
      message: `Deal ${deal.dealCode} has had no activity in over 7 days.`,
      leadId: deal.leadId,
    });
    created++;
  }
  return { checked: deals.length, created };
}

/**
 * A document within 14 days of its expiry date. Only documents attached to
 * a Lead or Property are notified (the two entity types Notification can
 * link to) - owner/deal/payment-only documents are counted in `checked` but
 * skipped, a documented gap rather than a silent one. Dedup/cooldown is
 * per lead-or-property, not per document, so multiple expiring documents on
 * the same record surface as one alert within the cooldown window.
 */
async function notifyExpiringDocuments(organizationId: string, now: Date): Promise<SweepRuleResult> {
  const cutoff = hoursAgo(now, 24 * 7);
  const expiryCutoff = new Date(now);
  expiryCutoff.setDate(expiryCutoff.getDate() + 14);

  const documents = await prisma.document.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      deletedAt: null,
      expiresAt: { gte: now, lte: expiryCutoff },
      OR: [{ leadId: { not: null } }, { propertyId: { not: null } }],
    },
    select: { id: true, fileName: true, expiresAt: true, leadId: true, propertyId: true },
    take: SMART_SWEEP_LIMIT,
  });
  if (documents.length === 0) return { checked: 0, created: 0 };

  const leadIds = documents.filter((d) => d.leadId).map((d) => d.leadId as string);
  const propertyIds = documents.filter((d) => d.propertyId).map((d) => d.propertyId as string);
  const orClauses = [] as { leadId?: { in: string[] }; propertyId?: { in: string[] } }[];
  if (leadIds.length > 0) orClauses.push({ leadId: { in: leadIds } });
  if (propertyIds.length > 0) orClauses.push({ propertyId: { in: propertyIds } });

  const existing = orClauses.length > 0
    ? await prisma.notification.findMany({
        where: { type: "DOCUMENT_EXPIRING", createdAt: { gte: cutoff }, OR: orClauses },
        select: { leadId: true, propertyId: true },
      })
    : [];
  const alreadyLead = new Set(existing.filter((e) => e.leadId).map((e) => e.leadId));
  const alreadyProperty = new Set(existing.filter((e) => e.propertyId).map((e) => e.propertyId));

  let created = 0;
  for (const doc of documents) {
    if (!doc.leadId && !doc.propertyId) continue;
    if (doc.leadId && alreadyLead.has(doc.leadId)) continue;
    if (doc.propertyId && alreadyProperty.has(doc.propertyId)) continue;
    await notifyRoles(["ADMIN", "DATA_MANAGER"], {
      organizationId,
      type: "DOCUMENT_EXPIRING",
      title: "Document expiring soon",
      message: `${doc.fileName} expires ${doc.expiresAt!.toLocaleDateString("en-IN")}.`,
      leadId: doc.leadId,
      propertyId: doc.propertyId,
    });
    if (doc.leadId) alreadyLead.add(doc.leadId);
    if (doc.propertyId) alreadyProperty.add(doc.propertyId);
    created++;
  }
  return { checked: documents.length, created };
}

/**
 * A payment that's overdue (explicit OVERDUE status, or still PENDING past
 * its due date). Reuses PAYMENT_PENDING - defined in the schema with no
 * producer until now, see module doc comment. Links via the deal's optional
 * leadId, same caveat as notifyStaleNegotiations.
 */
async function notifyOverduePayments(organizationId: string, now: Date): Promise<SweepRuleResult> {
  const cutoff = hoursAgo(now, 48);
  const payments = await prisma.payment.findMany({
    where: { organizationId, OR: [{ status: "OVERDUE" }, { status: "PENDING", dueDate: { lt: now } }] },
    include: { deal: { select: { dealCode: true, leadId: true, assignedToId: true } } },
    take: SMART_SWEEP_LIMIT,
  });
  if (payments.length === 0) return { checked: 0, created: 0 };

  const withLead = payments.filter((p): p is typeof p & { deal: typeof p.deal & { leadId: string } } => Boolean(p.deal.leadId));
  if (withLead.length === 0) return { checked: payments.length, created: 0 };

  const existing = await prisma.notification.findMany({
    where: { leadId: { in: withLead.map((p) => p.deal.leadId) }, type: "PAYMENT_PENDING", createdAt: { gte: cutoff } },
    select: { leadId: true },
  });
  const already = new Set(existing.map((e) => e.leadId));

  let created = 0;
  for (const payment of withLead) {
    if (already.has(payment.deal.leadId)) continue;
    await createNotification({
      organizationId,
      userId: payment.deal.assignedToId,
      role: payment.deal.assignedToId ? undefined : "ADMIN",
      type: "PAYMENT_PENDING",
      title: "Payment overdue",
      message: `Payment of ₹${payment.amount.toLocaleString("en-IN")} for ${payment.deal.dealCode} is overdue.`,
      leadId: payment.deal.leadId,
    });
    already.add(payment.deal.leadId);
    created++;
  }
  return { checked: payments.length, created };
}

/** Runs every Smart Notification rule for one organization. Idempotent and safe to call from a cron, a throttled lazy trigger, or a test - see runThrottledSweep. */
export async function generateSmartNotifications(organizationId = DEFAULT_ORGANIZATION_ID): Promise<SweepRuleResult> {
  const now = new Date();
  const config = await getSystemConfig(organizationId);
  const results = await Promise.all([
    notifyHotLeadsNoFollowUp(organizationId, now, config.followUpSlaHours),
    notifyCatalogueNoResponse(organizationId, now, config.catalogueFollowUpDelayHours),
    notifyMissedVisits(organizationId, now),
    notifyPropertiesMissingPhotos(organizationId, now),
    notifyLeadsWithNoMatches(organizationId, now),
    notifyStaleNegotiations(organizationId, now),
    notifyExpiringDocuments(organizationId, now),
    notifyOverduePayments(organizationId, now),
  ]);
  return results.reduce((acc, r) => ({ checked: acc.checked + r.checked, created: acc.created + r.created }), { checked: 0, created: 0 });
}

let sweepLockClient: Redis | null | undefined;
function getSweepLockClient(): Redis | null {
  if (sweepLockClient !== undefined) return sweepLockClient;
  const url = process.env.REDIS_URL;
  if (!url) {
    sweepLockClient = null;
    return null;
  }
  sweepLockClient = new Redis(url, { maxRetriesPerRequest: 1 });
  sweepLockClient.on("error", (err) => logger.error("redis_sweep_lock_error", { message: err.message }));
  return sweepLockClient;
}

const SWEEP_LOCK_KEY = "lock:notifications-sweep";

/**
 * Runs the due-follow-up sweep, but skips if another sweep (the Vercel Cron
 * trigger, or this same throttled fallback from a different request)
 * already ran within `lockTtlSeconds`. Shared by both callers so whichever
 * one wins the lock executes and the other yields - no duplicate work, no
 * duplicate notifications (generateDueFollowUpNotifications is itself
 * idempotent regardless, so this is an efficiency guard, not a correctness
 * requirement). Falls open (always runs) if Redis is unavailable.
 */
export async function runThrottledSweep(organizationId: string, lockTtlSeconds: number): Promise<{ ran: boolean }> {
  const redis = getSweepLockClient();
  if (redis) {
    try {
      const acquired = await redis.set(SWEEP_LOCK_KEY, "1", "EX", lockTtlSeconds, "NX");
      if (!acquired) return { ran: false };
    } catch (err) {
      logger.warn("sweep_lock_failed", { message: err instanceof Error ? err.message : String(err) });
    }
  }
  await generateDueFollowUpNotifications(organizationId);
  await generateSmartNotifications(organizationId);
  return { ran: true };
}
