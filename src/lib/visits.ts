/**
 * Catalogue -> Visit Scheduling -> Field Executive Visit workflow.
 *
 * This module is the single place that knows how a visit is created from a
 * catalogue, how "upcoming"/"today" are decided, and how per-property
 * progress is recorded. It deliberately extends the EXISTING Visit
 * architecture rather than introducing a parallel one:
 *
 *   * `Visit` stays the record. `Visit.propertyId` stays required and keeps
 *     holding the first/primary property so every pre-existing reader
 *     (visit-conflict, suggested-route, reports, the old visits table) is
 *     untouched.
 *   * `VisitProperty` is the new authoritative per-property set. Every visit
 *     gets rows here, including single-property ones, so there is exactly one
 *     progress code path.
 *   * Availability problems found on-site go through the existing Phase 4
 *     `PropertyAvailabilityReport` flow - this module only mirrors the
 *     resulting "couldn't be shown" state onto the VisitProperty row.
 *   * Shortlisting mirrors onto the existing
 *     `CatalogueShareProperty.executiveStatus = SHORTLISTED` when the visit
 *     came from a catalogue, so no second shortlist system is created.
 *
 * Day boundaries always come from src/lib/ist-date.ts. The CRM operates in
 * India; `new Date().setHours(0,0,0,0)` on a UTC server puts every visit
 * scheduled between 00:00 and 05:29 IST on the wrong calendar day, which is
 * what made "tomorrow's visit" vanish from Upcoming.
 */

import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { logActivity } from "./activity";
import { createNotification } from "./notifications";
import { recordAudit } from "./audit";
import { appendPropertyTimelineEvent } from "./property-timeline";
import { recalculateLeadScore } from "./scoring";
import { startOfIstDay, endOfIstDay } from "./ist-date";
import type { Prisma, Role, VisitOutcome, VisitPropertyStatus, VisitStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Status vocabulary
// ---------------------------------------------------------------------------

/**
 * A visit that is still going to happen (or is happening now). Everything
 * else - COMPLETED, CANCELLED, CLIENT_NO_SHOW, RESCHEDULED - is either done
 * or has been superseded and must not sit in an active queue. RESCHEDULED is
 * excluded because the reschedule flow moves the SAME row back to SCHEDULED;
 * a row left at RESCHEDULED is a historical marker only.
 */
export const ACTIVE_VISIT_STATUSES: VisitStatus[] = ["SCHEDULED", "CONFIRMED", "CLIENT_REACHED", "EMPLOYEE_REACHED", "IN_PROGRESS"];

/** Per-property states that count as "the executive has dealt with this one". */
export const RESOLVED_VISIT_PROPERTY_STATUSES: VisitPropertyStatus[] = ["VISITED", "SKIPPED", "CLIENT_REJECTED", "UNAVAILABLE"];

export function isActiveVisitStatus(status: VisitStatus): boolean {
  return ACTIVE_VISIT_STATUSES.includes(status);
}

export function isResolvedVisitPropertyStatus(status: VisitPropertyStatus): boolean {
  return RESOLVED_VISIT_PROPERTY_STATUSES.includes(status);
}

// ---------------------------------------------------------------------------
// Star ratings
// ---------------------------------------------------------------------------

export const MIN_REACTION_RATING = 1;
export const MAX_REACTION_RATING = 5;

export type InterestLabel = "LOW_INTEREST" | "MAYBE" | "INTERESTED" | "HIGHLY_INTERESTED";

export function isValidRating(rating: unknown): rating is number {
  return typeof rating === "number" && Number.isInteger(rating) && rating >= MIN_REACTION_RATING && rating <= MAX_REACTION_RATING;
}

/**
 * Display label derived from the raw star value. The integer stays the source
 * of truth - this is never persisted as the primary record, so re-banding
 * later needs no migration.
 */
export function interestLabelFromRating(rating: number | null | undefined): InterestLabel | null {
  if (!isValidRating(rating)) return null;
  if (rating <= 2) return "LOW_INTEREST";
  if (rating === 3) return "MAYBE";
  if (rating === 4) return "INTERESTED";
  return "HIGHLY_INTERESTED";
}

export const RATING_DESCRIPTIONS: Record<number, string> = {
  1: "Not Interested",
  2: "Low Interest",
  3: "Neutral / Maybe",
  4: "Interested",
  5: "Very Interested",
};

/**
 * Maps an overall visit rating onto the existing VisitOutcome enum so
 * completing a visit keeps feeding the analytics/lead-health machinery that
 * already reads `Visit.outcome`. Note what is NOT here: a 1-star visit maps
 * to NOT_INTERESTED as an *outcome*, which the existing PATCH route would
 * translate into a lead status - so completeVisit() below deliberately does
 * not run that lead-status mapping. A bad reaction to some properties is not
 * a decision to close the lead.
 */
export function visitOutcomeFromRating(rating: number): VisitOutcome {
  if (rating <= 1) return "NOT_INTERESTED";
  if (rating === 2) return "FOLLOW_UP_NEEDED";
  if (rating === 3) return "NEEDS_TIME";
  if (rating === 4) return "INTERESTED";
  return "HIGHLY_INTERESTED";
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export interface VisitProgress {
  total: number;
  visited: number;
  resolved: number;
  remaining: number;
  /** e.g. "1/3 Visited, 2 Remaining" */
  label: string;
  /** True once nothing is left PENDING - gates [Complete Visit]. */
  allResolved: boolean;
  averageRating: number | null;
}

export function computeVisitProgress(properties: { status: VisitPropertyStatus; reactionRating?: number | null }[]): VisitProgress {
  const total = properties.length;
  const visited = properties.filter((p) => p.status === "VISITED").length;
  const resolved = properties.filter((p) => isResolvedVisitPropertyStatus(p.status)).length;
  const remaining = total - resolved;
  const ratings = properties.map((p) => p.reactionRating).filter(isValidRating);
  return {
    total,
    visited,
    resolved,
    remaining,
    label: `${visited}/${total} Visited${remaining > 0 ? `, ${remaining} Remaining` : ""}`,
    // An empty visit has nothing to resolve, but must not read as "ready to
    // complete" - that would let a zero-property visit be completed.
    allResolved: total > 0 && remaining === 0,
    averageRating: ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
  };
}

// ---------------------------------------------------------------------------
// Queries - the "why didn't my visit show up" fix lives here
// ---------------------------------------------------------------------------

/**
 * Visits that should appear under "Upcoming". IST-anchored: strictly after
 * the end of the current IST day. `organizationId` is mandatory (not
 * optional-with-a-default) so a caller physically cannot forget to scope it -
 * the admin visits page previously queried with `{}` and would have returned
 * every organization's visits.
 */
export function upcomingVisitsWhere(organizationId: string, now: Date = new Date(), assignedToId?: string | null): Prisma.VisitWhereInput {
  return {
    organizationId,
    visitDate: { gt: endOfIstDay(now) },
    status: { in: ACTIVE_VISIT_STATUSES },
    ...(assignedToId ? { assignedToId } : {}),
  };
}

/** Visits on the current IST calendar day, still active. */
export function todaysVisitsWhere(organizationId: string, now: Date = new Date(), assignedToId?: string | null): Prisma.VisitWhereInput {
  return {
    organizationId,
    visitDate: { gte: startOfIstDay(now), lte: endOfIstDay(now) },
    status: { in: ACTIVE_VISIT_STATUSES },
    ...(assignedToId ? { assignedToId } : {}),
  };
}

/** Completed visits on the current IST calendar day - the manager dashboard tile. */
export function completedTodayWhere(organizationId: string, now: Date = new Date()): Prisma.VisitWhereInput {
  return { organizationId, visitDate: { gte: startOfIstDay(now), lte: endOfIstDay(now) }, status: "COMPLETED" };
}

/**
 * The role filter. A FIELD_EXECUTIVE sees visits where they are the person
 * assigned to physically perform the visit - `assignedToId`. Explicitly NOT
 * createdById, not the lead owner, and not the catalogue creator.
 */
export function visitRoleScopeWhere(organizationId: string, user: { id: string; role: Role }): Prisma.VisitWhereInput {
  const base: Prisma.VisitWhereInput = { organizationId };
  if (user.role === "FIELD_EXECUTIVE") base.assignedToId = user.id;
  return base;
}

// ---------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------

export interface VisitActor {
  id: string;
  role: Role;
}

/**
 * Loads a visit and enforces org + role access in one place. Cross-org is a
 * 404, not a 403, so an outsider cannot probe for the existence of an ID.
 */
export async function loadVisitForActor(visitId: string, organizationId: string, actor: VisitActor) {
  const visit = await prisma.visit.findFirst({
    where: { id: visitId, organizationId },
    include: {
      lead: true,
      property: true,
      assignedTo: true,
      catalogueShare: true,
      // `partner` is needed so the detail DTO can show INDIRECT-inventory
      // contact details under the existing DIRECT/INDIRECT exposure rule.
      properties: { include: { property: { include: { partner: true } }, visitedBy: true }, orderBy: { sequence: "asc" } },
    },
  });
  if (!visit) throw new ApiError(404, "Visit not found");
  if (actor.role === "FIELD_EXECUTIVE" && visit.assignedToId !== actor.id) {
    throw new ApiError(404, "Visit not found");
  }
  return visit;
}

export type VisitForActor = Awaited<ReturnType<typeof loadVisitForActor>>;

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

export interface ScheduleVisitInput {
  organizationId: string;
  leadId: string;
  /**
   * The properties actually selected in the scheduling UX, in display order.
   * When scheduling from a catalogue this is the explicit selection - NOT
   * automatically every property in the catalogue. An empty array is rejected.
   */
  propertyIds: string[];
  assignedToId?: string | null;
  visitDate: Date;
  visitTime: string;
  meetingLocation?: string | null;
  catalogueShareId?: string | null;
  createdById?: string | null;
  /**
   * Route/conflict metadata computed by the existing checkVisitConflict flow.
   * Passed straight through so the Maps & Localities behaviour is preserved
   * exactly rather than reimplemented here.
   */
  conflictData?: VisitConflictFields;
}

/** The subset of Visit columns the existing conflict-detection flow populates. */
export interface VisitConflictFields {
  travelDurationMinutes?: number | null;
  travelDistanceMeters?: number | null;
  routeCheckedAt?: Date | null;
  routeSource?: Prisma.VisitUncheckedCreateInput["routeSource"];
  conflictStatus?: Prisma.VisitUncheckedCreateInput["conflictStatus"];
  conflictDetail?: string | null;
  conflictOverrideReason?: string | null;
  conflictOverrideByUserId?: string | null;
  conflictOverrideAt?: Date | null;
}

/**
 * Creates a Visit plus its VisitProperty rows in one transaction, then fires
 * the existing side effects (activity timeline, lead score, property
 * timeline, executive notification, audit).
 *
 * `Visit.propertyId` is set to propertyIds[0] for backwards compatibility -
 * every legacy reader of `visit.property` keeps working and shows the first
 * property of the visit.
 */
export async function scheduleVisit(input: ScheduleVisitInput) {
  const propertyIds = dedupePreservingOrder(input.propertyIds);
  if (propertyIds.length === 0) throw new ApiError(400, "Select at least one property for the visit");

  // Every property must exist in this organization. Prevents a caller
  // stapling another org's property onto a visit.
  const properties = await prisma.property.findMany({
    where: { id: { in: propertyIds }, organizationId: input.organizationId },
    select: { id: true, title: true, area: true },
  });
  if (properties.length !== propertyIds.length) throw new ApiError(400, "One or more selected properties could not be found");

  const visit = await prisma.visit.create({
    data: {
      ...(input.conflictData ?? {}),
      organizationId: input.organizationId,
      leadId: input.leadId,
      propertyId: propertyIds[0],
      assignedToId: input.assignedToId ?? null,
      visitDate: input.visitDate,
      visitTime: input.visitTime,
      meetingLocation: input.meetingLocation ?? null,
      catalogueShareId: input.catalogueShareId ?? null,
      createdById: input.createdById ?? null,
      status: "SCHEDULED",
      properties: {
        create: propertyIds.map((propertyId, index) => ({
          organizationId: input.organizationId,
          propertyId,
          sequence: index,
        })),
      },
    },
    include: { lead: true, assignedTo: true, properties: { include: { property: true }, orderBy: { sequence: "asc" } } },
  });

  const dateLabel = formatIstDateLabel(visit.visitDate);
  const propertyCount = propertyIds.length;

  await logActivity({
    leadId: input.leadId,
    type: "VISIT_SCHEDULED",
    actorId: input.createdById ?? null,
    description: `Visit scheduled for ${dateLabel} at ${input.visitTime} - ${propertyCount} ${propertyCount === 1 ? "property" : "properties"}${visit.assignedTo ? `, assigned to ${visit.assignedTo.name}` : ""}.`,
    metadata: { visitId: visit.id, propertyCount, catalogueShareId: input.catalogueShareId ?? null },
  });

  await prisma.lead.update({ where: { id: input.leadId }, data: { status: "VISIT_SCHEDULED" } });
  await recalculateLeadScore(input.leadId, "VISIT_SCHEDULED");

  await Promise.all(
    propertyIds.map((propertyId) =>
      appendPropertyTimelineEvent({ organizationId: input.organizationId, propertyId, eventType: "VISIT_SCHEDULED", actorId: input.createdById ?? undefined })
    )
  );

  if (visit.assignedToId) {
    await createNotification({
      organizationId: input.organizationId,
      userId: visit.assignedToId,
      type: "VISIT_SCHEDULED",
      title: "New visit assigned",
      // Deliberately an in-app Notification row only. No WhatsApp is sent for
      // internal visit assignment - WhatsApp is reserved for client-facing
      // messaging and must not be triggered by an internal workflow.
      message: `${visit.lead.clientName} - ${dateLabel} ${input.visitTime} - ${propertyCount} ${propertyCount === 1 ? "property" : "properties"}`,
      leadId: input.leadId,
      visitId: visit.id,
      propertyId: propertyIds[0],
    });
  }

  await recordAudit({
    userId: input.createdById ?? undefined,
    action: "CREATE",
    entityType: "Visit",
    entityId: visit.id,
    newValues: { event: "visit_scheduled", propertyIds, assignedToId: visit.assignedToId, catalogueShareId: input.catalogueShareId ?? null },
  });

  return visit;
}

/**
 * Schedules a visit from a catalogue. `propertyIds` must be a subset of the
 * catalogue's currently-active (non-removed) properties.
 *
 * Documented UX decision: the caller passes an explicit selection. When the
 * selection is omitted entirely we fall back to every active catalogue
 * property, because the public "Request Visits" button on the catalogue page
 * is a bulk request across the whole catalogue (see
 * public-catalogue-view.tsx "Request Visits") - that genuinely is the
 * intended behaviour for that one entry point. Every internal/admin entry
 * point passes an explicit selection.
 */
export async function scheduleVisitFromCatalogue(input: {
  catalogueShareId: string;
  organizationId: string;
  propertyIds?: string[];
  assignedToId?: string | null;
  visitDate: Date;
  visitTime: string;
  meetingLocation?: string | null;
  createdById?: string | null;
}) {
  const catalogue = await prisma.catalogueShare.findFirst({
    where: { id: input.catalogueShareId, organizationId: input.organizationId },
    include: { properties: { where: { removedAt: null }, orderBy: { sortOrder: "asc" } } },
  });
  if (!catalogue) throw new ApiError(404, "Catalogue not found");

  const activeIds = catalogue.properties.map((p) => p.propertyId);
  const selected = input.propertyIds && input.propertyIds.length > 0 ? dedupePreservingOrder(input.propertyIds) : activeIds;

  const notInCatalogue = selected.filter((id) => !activeIds.includes(id));
  if (notInCatalogue.length > 0) throw new ApiError(400, "One or more selected properties are not part of this catalogue");

  return scheduleVisit({
    organizationId: input.organizationId,
    leadId: catalogue.leadId,
    propertyIds: selected,
    assignedToId: input.assignedToId,
    visitDate: input.visitDate,
    visitTime: input.visitTime,
    meetingLocation: input.meetingLocation,
    catalogueShareId: catalogue.id,
    createdById: input.createdById,
  });
}

// ---------------------------------------------------------------------------
// Start Visit
// ---------------------------------------------------------------------------

/**
 * SCHEDULED -> IN_PROGRESS. Idempotent: starting an already-started visit
 * returns it unchanged rather than re-stamping startedAt or double-logging.
 * Explicitly does NOT touch any VisitProperty - starting a visit is not the
 * same as having shown anything.
 */
export async function startVisit(visitId: string, organizationId: string, actor: VisitActor) {
  const visit = await loadVisitForActor(visitId, organizationId, actor);

  if (visit.status === "IN_PROGRESS") return visit;
  if (visit.status === "COMPLETED" || visit.status === "CANCELLED") {
    throw new ApiError(400, `This visit is already ${visit.status.toLowerCase()} and cannot be started.`);
  }

  const startedAt = new Date();
  await prisma.visit.update({ where: { id: visit.id }, data: { status: "IN_PROGRESS", startedAt } });

  await logActivity({
    leadId: visit.leadId,
    type: "STATUS_CHANGED",
    actorId: actor.id,
    description: `Visit started${visit.assignedTo ? ` by ${visit.assignedTo.name}` : ""} - ${visit.properties.length} ${visit.properties.length === 1 ? "property" : "properties"} to show.`,
    metadata: { visitId: visit.id, event: "visit_started" },
  });
  await recordAudit({ userId: actor.id, action: "UPDATE", entityType: "Visit", entityId: visit.id, oldValues: { status: visit.status }, newValues: { event: "visit_started", status: "IN_PROGRESS", startedAt } });

  return loadVisitForActor(visitId, organizationId, actor);
}

// ---------------------------------------------------------------------------
// Per-property progress
// ---------------------------------------------------------------------------

export interface RecordVisitPropertyInput {
  status: VisitPropertyStatus;
  /** 1-5. Only meaningful for VISITED/CLIENT_REJECTED; optional everywhere. */
  reactionRating?: number | null;
  /** Free text. Never compulsory. */
  reactionNote?: string | null;
  /** Optional reason, used by SKIPPED/UNAVAILABLE. */
  skipReason?: string | null;
}

/**
 * Records the outcome for one property inside a visit.
 *
 * Duplicate-completion safe: re-marking an already-VISITED property updates
 * the reaction but does NOT re-stamp visitedAt or write a second timeline
 * entry, so a double-tap on a phone cannot pollute the lead timeline.
 */
export async function recordVisitPropertyOutcome(
  visitId: string,
  propertyId: string,
  organizationId: string,
  actor: VisitActor,
  input: RecordVisitPropertyInput
) {
  const visit = await loadVisitForActor(visitId, organizationId, actor);
  if (visit.status === "CANCELLED") throw new ApiError(400, "This visit was cancelled.");

  const entry = visit.properties.find((p) => p.propertyId === propertyId);
  if (!entry) throw new ApiError(404, "That property is not part of this visit");

  if (input.reactionRating !== undefined && input.reactionRating !== null && !isValidRating(input.reactionRating)) {
    throw new ApiError(400, "Client reaction must be a whole number of stars from 1 to 5");
  }

  const wasAlreadyResolved = isResolvedVisitPropertyStatus(entry.status);
  const now = new Date();

  const updated = await prisma.visitProperty.update({
    where: { id: entry.id },
    data: {
      status: input.status,
      // Only stamp on the first resolution - keeps "when was this actually
      // shown" honest across edits.
      visitedAt: entry.visitedAt ?? (isResolvedVisitPropertyStatus(input.status) ? now : null),
      visitedById: entry.visitedById ?? (isResolvedVisitPropertyStatus(input.status) ? actor.id : null),
      reactionRating: input.reactionRating === undefined ? entry.reactionRating : input.reactionRating,
      reactionNote: input.reactionNote === undefined ? entry.reactionNote : input.reactionNote,
      skipReason: input.skipReason === undefined ? entry.skipReason : input.skipReason,
    },
    include: { property: true },
  });

  // A visit whose first property is being worked implies the visit is under
  // way; auto-promote SCHEDULED -> IN_PROGRESS rather than leaving a visit
  // stuck at SCHEDULED with visited properties inside it.
  if (visit.status !== "IN_PROGRESS" && visit.status !== "COMPLETED") {
    await prisma.visit.update({ where: { id: visit.id }, data: { status: "IN_PROGRESS", startedAt: visit.startedAt ?? now } });
  }

  if (!wasAlreadyResolved) {
    const sequenceLabel = `Property ${updated.sequence + 1}`;
    const ratingLabel = isValidRating(updated.reactionRating) ? ` - client reaction ${updated.reactionRating}/5 (${RATING_DESCRIPTIONS[updated.reactionRating]})` : "";

    await logActivity({
      leadId: visit.leadId,
      type: input.status === "VISITED" ? "VISIT_OUTCOME_RECORDED" : "STATUS_CHANGED",
      actorId: actor.id,
      description:
        input.status === "VISITED"
          ? `${sequenceLabel} visited: ${updated.property.title}${ratingLabel}`
          : `${sequenceLabel} ${input.status.toLowerCase().replace(/_/g, " ")}: ${updated.property.title}${input.skipReason ? ` - ${input.skipReason}` : ""}`,
      metadata: { visitId: visit.id, propertyId, status: input.status, reactionRating: updated.reactionRating },
    });

    // Property timeline: "Shown to <client>" plus the reaction. Uses the
    // existing property-timeline architecture and stores no commercial data.
    if (input.status === "VISITED") {
      await appendPropertyTimelineEvent({
        organizationId,
        propertyId,
        eventType: "SHOWN_TO_CLIENT",
        toValue: isValidRating(updated.reactionRating) ? `${updated.reactionRating}/5` : undefined,
        note: `Shown to ${visit.lead.clientName}${isValidRating(updated.reactionRating) ? ` - client reaction ${updated.reactionRating}/5` : ""}`,
        actorId: actor.id,
      });
    }
  }

  // Mirror onto the catalogue's own per-property engagement checklist so the
  // catalogue view and the visit view never disagree. Reuses the existing
  // Phase 4 CatalogueExecutiveStatus rather than adding a parallel field.
  if (visit.catalogueShareId) {
    const executiveStatus = catalogueStatusForVisitProperty(input.status, updated.reactionRating);
    if (executiveStatus) {
      await prisma.catalogueShareProperty
        .updateMany({
          where: { catalogueShareId: visit.catalogueShareId, propertyId },
          data: { executiveStatus, executiveStatusUpdatedAt: now, executiveStatusUpdatedById: actor.id },
        })
        .catch(() => undefined);
    }
  }

  await recordAudit({
    userId: actor.id,
    action: "UPDATE",
    entityType: "VisitProperty",
    entityId: updated.id,
    oldValues: { status: entry.status },
    newValues: { event: "visit_property_outcome", status: input.status, reactionRating: updated.reactionRating },
  });

  return updated;
}

function catalogueStatusForVisitProperty(status: VisitPropertyStatus, rating: number | null): "SHOWN" | "CUSTOMER_LIKED" | "REJECTED" | null {
  if (status === "CLIENT_REJECTED") return "REJECTED";
  if (status !== "VISITED") return null;
  if (isValidRating(rating) && rating >= 4) return "CUSTOMER_LIKED";
  if (isValidRating(rating) && rating <= 2) return "REJECTED";
  return "SHOWN";
}

// ---------------------------------------------------------------------------
// Complete Visit
// ---------------------------------------------------------------------------

/**
 * IN_PROGRESS -> COMPLETED. Requires every property resolved; the executive
 * must explicitly skip a property they didn't show rather than silently
 * dropping it.
 *
 * Note what this does NOT do: it does not close, reject, or otherwise
 * downgrade the Lead based on the rating. A poor reaction to some properties
 * is information for a human, not an automatic lead closure. Lead status is
 * only advanced to VISIT_COMPLETED (never to NOT_INTERESTED).
 */
export async function completeVisit(
  visitId: string,
  organizationId: string,
  actor: VisitActor,
  input: { overallRating?: number | null; summary?: string | null; preferredPropertyIds?: string[] }
) {
  const visit = await loadVisitForActor(visitId, organizationId, actor);
  if (visit.status === "COMPLETED") return visit;
  if (visit.status === "CANCELLED") throw new ApiError(400, "This visit was cancelled and cannot be completed.");

  const progress = computeVisitProgress(visit.properties);
  if (!progress.allResolved) {
    throw new ApiError(400, `${progress.remaining} propert${progress.remaining === 1 ? "y" : "ies"} still pending. Mark each as visited or skipped before completing the visit.`);
  }

  if (input.overallRating !== undefined && input.overallRating !== null && !isValidRating(input.overallRating)) {
    throw new ApiError(400, "Overall client interest must be a whole number of stars from 1 to 5");
  }

  const completedAt = new Date();
  await prisma.visit.update({
    where: { id: visit.id },
    data: {
      status: "COMPLETED",
      completedAt,
      overallRating: input.overallRating ?? null,
      completionSummary: input.summary ?? null,
      outcome: isValidRating(input.overallRating) ? visitOutcomeFromRating(input.overallRating) : visit.outcome,
    },
  });

  // Advance the lead to VISIT_COMPLETED only from a pre-visit state. Never
  // overwrite a further-along status (NEGOTIATION, CLOSED_WON, ...) and never
  // move it backwards to a rejection based on stars alone.
  await prisma.lead.updateMany({
    where: { id: visit.leadId, status: { in: ["VISIT_SCHEDULED", "CONTACTED", "QUALIFIED", "NEW"] } },
    data: { status: "VISIT_COMPLETED" },
  });
  await recalculateLeadScore(visit.leadId, "VISIT_COMPLETED");

  await logActivity({
    leadId: visit.leadId,
    type: "VISIT_COMPLETED",
    actorId: actor.id,
    description: `Visit completed - ${progress.visited}/${progress.total} properties shown${isValidRating(input.overallRating) ? `, overall client interest ${input.overallRating}/5 (${RATING_DESCRIPTIONS[input.overallRating]})` : ""}.`,
    metadata: { visitId: visit.id, overallRating: input.overallRating ?? null, visited: progress.visited, total: progress.total },
  });

  if (input.preferredPropertyIds && input.preferredPropertyIds.length > 0) {
    await setPreferredProperties(visitId, organizationId, actor, input.preferredPropertyIds);
  }

  await recordAudit({
    userId: actor.id,
    action: "UPDATE",
    entityType: "Visit",
    entityId: visit.id,
    oldValues: { status: visit.status },
    newValues: { event: "visit_completed", overallRating: input.overallRating ?? null, completedAt },
  });

  return loadVisitForActor(visitId, organizationId, actor);
}

// ---------------------------------------------------------------------------
// Preferred property / shortlist
// ---------------------------------------------------------------------------

/**
 * Marks the client's preferred properties after a visit. Reuses the existing
 * catalogue shortlist: when the visit came from a catalogue, the matching
 * CatalogueShareProperty rows are moved to executiveStatus = SHORTLISTED, so
 * the catalogue stays the single shortlist surface rather than a second,
 * conflicting one appearing on the visit.
 */
export async function setPreferredProperties(visitId: string, organizationId: string, actor: VisitActor, propertyIds: string[]) {
  const visit = await loadVisitForActor(visitId, organizationId, actor);
  const ids = dedupePreservingOrder(propertyIds);

  const unknown = ids.filter((id) => !visit.properties.some((p) => p.propertyId === id));
  if (unknown.length > 0) throw new ApiError(400, "Only properties that are part of this visit can be marked as preferred");

  const notVisited = ids.filter((id) => visit.properties.find((p) => p.propertyId === id)?.status !== "VISITED");
  if (notVisited.length > 0) throw new ApiError(400, "Only properties the client actually visited can be marked as preferred");

  await prisma.visitProperty.updateMany({ where: { visitId: visit.id }, data: { isPreferred: false } });
  if (ids.length > 0) {
    await prisma.visitProperty.updateMany({ where: { visitId: visit.id, propertyId: { in: ids } }, data: { isPreferred: true } });
  }

  if (visit.catalogueShareId && ids.length > 0) {
    await prisma.catalogueShareProperty
      .updateMany({
        where: { catalogueShareId: visit.catalogueShareId, propertyId: { in: ids } },
        data: { executiveStatus: "SHORTLISTED", executiveStatusUpdatedAt: new Date(), executiveStatusUpdatedById: actor.id },
      })
      .catch(() => undefined);
  }

  if (ids.length > 0) {
    const titles = ids.map((id) => visit.properties.find((p) => p.propertyId === id)?.property.title).filter(Boolean);
    await logActivity({
      leadId: visit.leadId,
      type: "PROPERTY_INTERESTED",
      actorId: actor.id,
      description: `Client preferred ${titles.length === 1 ? "property" : "properties"}: ${titles.join(", ")}`,
      metadata: { visitId: visit.id, preferredPropertyIds: ids },
    });
  }

  return prisma.visitProperty.findMany({ where: { visitId: visit.id }, orderBy: { sequence: "asc" } });
}

// ---------------------------------------------------------------------------
// Reschedule / cancel
// ---------------------------------------------------------------------------

/**
 * Admin/Data Manager only. Moves date/time and/or reassigns the executive.
 * The new executive is notified; the previous one is told it moved off their
 * plate. Assignment history is an audit-log entry - there is no visit-level
 * assignment-history table in this codebase and building one for this is not
 * warranted.
 */
export async function rescheduleVisit(
  visitId: string,
  organizationId: string,
  actor: VisitActor,
  input: { visitDate?: Date; visitTime?: string; assignedToId?: string | null }
) {
  if (actor.role === "FIELD_EXECUTIVE") throw new ApiError(403, "Only an Admin or Data Manager can reschedule a visit");
  const visit = await loadVisitForActor(visitId, organizationId, actor);
  if (visit.status === "COMPLETED") throw new ApiError(400, "A completed visit cannot be rescheduled.");

  const nextDate = input.visitDate ?? visit.visitDate;
  const nextTime = input.visitTime ?? visit.visitTime;
  const nextAssignee = input.assignedToId !== undefined ? input.assignedToId : visit.assignedToId;
  const assigneeChanged = nextAssignee !== visit.assignedToId;

  await prisma.visit.update({
    where: { id: visit.id },
    // Back to SCHEDULED: a rescheduled visit must reappear in the active
    // queue, which is exactly what the previous behaviour (leaving it at
    // RESCHEDULED) failed to do.
    data: { visitDate: nextDate, visitTime: nextTime, assignedToId: nextAssignee, status: "SCHEDULED" },
  });

  const dateLabel = formatIstDateLabel(nextDate);
  await logActivity({
    leadId: visit.leadId,
    type: "STATUS_CHANGED",
    actorId: actor.id,
    description: `Visit rescheduled to ${dateLabel} at ${nextTime}${assigneeChanged ? " and reassigned" : ""}.`,
    metadata: { visitId: visit.id, event: "visit_rescheduled" },
  });

  if (nextAssignee) {
    await createNotification({
      organizationId,
      userId: nextAssignee,
      type: assigneeChanged ? "VISIT_SCHEDULED" : "VISIT_RESCHEDULED",
      title: assigneeChanged ? "New visit assigned" : "Visit rescheduled",
      message: `${visit.lead.clientName} - ${dateLabel} ${nextTime} - ${visit.properties.length} ${visit.properties.length === 1 ? "property" : "properties"}`,
      leadId: visit.leadId,
      visitId: visit.id,
    });
  }
  if (assigneeChanged && visit.assignedToId) {
    await createNotification({
      organizationId,
      userId: visit.assignedToId,
      type: "VISIT_RESCHEDULED",
      title: "Visit reassigned",
      message: `${visit.lead.clientName}'s visit on ${dateLabel} has been reassigned to another executive.`,
      leadId: visit.leadId,
      visitId: visit.id,
    });
  }

  await recordAudit({
    userId: actor.id,
    action: "UPDATE",
    entityType: "Visit",
    entityId: visit.id,
    oldValues: { visitDate: visit.visitDate, visitTime: visit.visitTime, assignedToId: visit.assignedToId },
    newValues: { event: "visit_rescheduled", visitDate: nextDate, visitTime: nextTime, assignedToId: nextAssignee },
  });

  return loadVisitForActor(visitId, organizationId, actor);
}

/** Admin/Data Manager only. Cancelled visits leave the active queue but stay in history. */
export async function cancelVisit(visitId: string, organizationId: string, actor: VisitActor, reason: string) {
  if (actor.role === "FIELD_EXECUTIVE") throw new ApiError(403, "Only an Admin or Data Manager can cancel a visit");
  const visit = await loadVisitForActor(visitId, organizationId, actor);
  if (visit.status === "COMPLETED") throw new ApiError(400, "A completed visit cannot be cancelled.");
  if (!reason || reason.trim().length < 3) throw new ApiError(400, "A cancellation reason is required");

  await prisma.visit.update({ where: { id: visit.id }, data: { status: "CANCELLED", cancellationReason: reason.trim() } });

  await logActivity({ leadId: visit.leadId, type: "STATUS_CHANGED", actorId: actor.id, description: `Visit cancelled: ${reason.trim()}`, metadata: { visitId: visit.id, event: "visit_cancelled" } });

  if (visit.assignedToId) {
    await createNotification({
      organizationId,
      userId: visit.assignedToId,
      type: "VISIT_CANCELLED",
      title: "Visit cancelled",
      message: `${visit.lead.clientName}'s visit on ${formatIstDateLabel(visit.visitDate)} was cancelled: ${reason.trim()}`,
      leadId: visit.leadId,
      visitId: visit.id,
    });
  }

  await recordAudit({ userId: actor.id, action: "UPDATE", entityType: "Visit", entityId: visit.id, oldValues: { status: visit.status }, newValues: { event: "visit_cancelled", reason: reason.trim() } });

  return loadVisitForActor(visitId, organizationId, actor);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dedupePreservingOrder(ids: string[]): string[] {
  return [...new Set(ids ?? [])];
}

/** "18 Aug 2026" rendered on the IST calendar, regardless of server timezone. */
export function formatIstDateLabel(date: Date): string {
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}
