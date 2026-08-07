import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { logActivity } from "./activity";
import { createNotification } from "./notifications";
import { recalculateLeadScore } from "./scoring";
import { runAutomationRules } from "./automation-rules";
import { appendPropertyTimelineEvent } from "./property-timeline";
import type { CatalogueInteractionType } from "@prisma/client";

const VIEW_DEDUPE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const INTERACTION_DEDUPE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Records a catalogue page view, but only once per viewer per dedupe
 * window - refreshing the page (or the client re-opening the link a minute
 * later) must not inflate viewCount or spam the assigned employee. The
 * viewer is identified by an opaque token the public page sets in a cookie
 * on first visit (see /share/catalogue/[token]/page.tsx) - no PII, no
 * database ID is embedded in it.
 */
export async function recordCatalogueView(catalogueShareId: string, viewerToken: string) {
  const cutoff = new Date(Date.now() - VIEW_DEDUPE_WINDOW_MS);
  const recentViews = await prisma.catalogueInteraction.findMany({
    where: { catalogueShareId, type: "VIEWED", createdAt: { gte: cutoff } },
  });

  const alreadyCounted = recentViews.some((v) => {
    try {
      return v.metadata && JSON.parse(v.metadata).viewerToken === viewerToken;
    } catch {
      return false;
    }
  });
  if (alreadyCounted) return { deduped: true };

  const catalogue = await prisma.catalogueShare.findUnique({ where: { id: catalogueShareId }, include: { lead: true } });
  if (!catalogue) throw new ApiError(404, "Catalogue not found");

  const isFirstViewEver = catalogue.viewCount === 0;

  await prisma.$transaction([
    prisma.catalogueInteraction.create({
      data: { organizationId: catalogue.organizationId, catalogueShareId, type: "VIEWED", metadata: JSON.stringify({ viewerToken }) },
    }),
    prisma.catalogueShare.update({ where: { id: catalogueShareId }, data: { viewCount: { increment: 1 }, lastViewedAt: new Date() } }),
  ]);

  await logActivity({ leadId: catalogue.leadId, type: "CATALOGUE_VIEWED", description: "Client viewed the property catalogue." });
  await recalculateLeadScore(catalogue.leadId, "CATALOGUE_VIEWED");
  await runAutomationRules({ trigger: "CATALOGUE_OPENED", catalogueShareId, leadId: catalogue.leadId, organizationId: catalogue.organizationId });

  // Phase 4, Objective 8 - complete property history includes catalogue
  // views. Same "first view only" rule as the notification below - repeat
  // views don't spam the timeline either.
  if (isFirstViewEver) {
    const properties = await prisma.catalogueShareProperty.findMany({ where: { catalogueShareId, removedAt: null }, select: { propertyId: true } });
    await Promise.all(
      properties.map((p) =>
        appendPropertyTimelineEvent({ organizationId: catalogue.organizationId, propertyId: p.propertyId, eventType: "CATALOGUE_VIEWED", note: `Catalogue "${catalogue.title}"` })
      )
    );
  }

  // Only the FIRST view notifies the assigned employee - every subsequent
  // view within/across windows just increments the counter silently, per
  // the "avoid notification spam" requirement.
  if (isFirstViewEver && catalogue.lead.assignedToId) {
    await createNotification({
      organizationId: catalogue.organizationId,
      userId: catalogue.lead.assignedToId,
      type: "CATALOGUE_VIEWED",
      title: "Catalogue viewed",
      message: `${catalogue.lead.clientName} viewed the "${catalogue.title}" catalogue.`,
      leadId: catalogue.leadId,
    });
  }

  return { deduped: false };
}

interface InteractionInput {
  type: Exclude<CatalogueInteractionType, "VIEWED">;
  propertyId?: string;
  message?: string;
  clientName?: string;
  clientPhone?: string;
  preferredDate?: string;
  preferredWindow?: string;
}

export async function recordCatalogueInteraction(catalogueShareId: string, input: InteractionInput) {
  const catalogue = await prisma.catalogueShare.findUnique({ where: { id: catalogueShareId }, include: { lead: true } });
  if (!catalogue) throw new ApiError(404, "Catalogue not found");
  if (catalogue.status !== "ACTIVE") throw new ApiError(400, `This catalogue link is ${catalogue.status.toLowerCase()} and no longer accepts interactions.`);

  if (input.propertyId) {
    const belongs = await prisma.catalogueShareProperty.findUnique({
      where: { catalogueShareId_propertyId: { catalogueShareId, propertyId: input.propertyId } },
    });
    if (!belongs) throw new ApiError(400, "That property is not part of this catalogue");
  }

  const metadata =
    input.preferredDate || input.preferredWindow
      ? JSON.stringify({ preferredDate: input.preferredDate, preferredWindow: input.preferredWindow })
      : null;

  // Idempotent duplicate-click prevention: a client double-tapping a button
  // (or a retried request after a flaky network) must not create a second
  // interaction row, re-notify the assigned employee, or double-fire
  // side effects (follow-ups, rescoring). Scoped to the same catalogue +
  // property + type within a short window - deliberately narrower than the
  // view dedupe window since these are explicit user actions, not passive
  // page loads.
  const dedupeCutoff = new Date(Date.now() - INTERACTION_DEDUPE_WINDOW_MS);
  const existing = await prisma.catalogueInteraction.findFirst({
    where: {
      catalogueShareId,
      propertyId: input.propertyId ?? null,
      type: input.type,
      createdAt: { gte: dedupeCutoff },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const interaction = await prisma.catalogueInteraction.create({
    data: {
      organizationId: catalogue.organizationId,
      catalogueShareId,
      propertyId: input.propertyId,
      type: input.type,
      message: input.message,
      clientName: input.clientName,
      clientPhone: input.clientPhone,
      metadata,
    },
  });

  const property = input.propertyId ? await prisma.property.findUnique({ where: { id: input.propertyId } }) : null;
  const propertyLabel = property ? `${property.propertyCode}` : null;

  const activityDescriptions: Record<InteractionInput["type"], string> = {
    PROPERTY_VIEWED: `Client viewed property ${propertyLabel ?? ""}`.trim(),
    INTERESTED: `Client marked ${propertyLabel ? `property ${propertyLabel}` : "a property"} as interested.`,
    NOT_INTERESTED: `Client marked ${propertyLabel ? `property ${propertyLabel}` : "a property"} as not interested${input.message ? `: ${input.message}` : "."}`,
    VISIT_REQUESTED: `Client requested a visit${input.preferredDate ? ` for ${input.preferredDate}` : ""}${input.preferredWindow ? `, ${input.preferredWindow}` : ""}.`,
    QUESTION_ASKED: `Client asked a question${propertyLabel ? ` about property ${propertyLabel}` : ""}: "${input.message ?? ""}"`,
    CALL_REQUESTED: "Client requested a call back.",
    WHATSAPP_REQUESTED: "Client requested to continue on WhatsApp.",
  };

  const activityTypeMap: Partial<Record<InteractionInput["type"], "PROPERTY_INTERESTED" | "PROPERTY_NOT_INTERESTED" | "VISIT_REQUESTED" | "QUESTION_ASKED">> = {
    INTERESTED: "PROPERTY_INTERESTED",
    NOT_INTERESTED: "PROPERTY_NOT_INTERESTED",
    VISIT_REQUESTED: "VISIT_REQUESTED",
    QUESTION_ASKED: "QUESTION_ASKED",
  };

  await logActivity({
    leadId: catalogue.leadId,
    type: activityTypeMap[input.type] ?? "NOTE_ADDED",
    description: activityDescriptions[input.type],
  });

  // NotificationType has no CALL_REQUESTED/WHATSAPP_REQUESTED value (schema
  // is frozen for this workstream) - both map onto CLIENT_REPLY_RECEIVED,
  // the closest existing category for "client wants direct contact now",
  // rather than skip notifying the assigned employee entirely.
  const notificationTypeMap: Partial<Record<InteractionInput["type"], "PROPERTY_INTERESTED" | "PROPERTY_NOT_INTERESTED" | "VISIT_REQUESTED" | "QUESTION_ASKED" | "CLIENT_REPLY_RECEIVED">> = {
    INTERESTED: "PROPERTY_INTERESTED",
    VISIT_REQUESTED: "VISIT_REQUESTED",
    QUESTION_ASKED: "QUESTION_ASKED",
    CALL_REQUESTED: "CLIENT_REPLY_RECEIVED",
    WHATSAPP_REQUESTED: "CLIENT_REPLY_RECEIVED",
  };
  const notifType = notificationTypeMap[input.type];
  if (notifType && catalogue.lead.assignedToId) {
    await createNotification({
      organizationId: catalogue.organizationId,
      userId: catalogue.lead.assignedToId,
      type: notifType,
      title: activityDescriptions[input.type].split(":")[0],
      message: `${catalogue.lead.clientName} - ${activityDescriptions[input.type]}`,
      leadId: catalogue.leadId,
      propertyId: input.propertyId,
    });
  }

  if (input.type === "VISIT_REQUESTED") {
    await prisma.followUp.create({
      data: {
        organizationId: catalogue.organizationId,
        leadId: catalogue.leadId,
        ownerId: catalogue.lead.assignedToId,
        type: "VISIT_CONFIRMATION",
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // follow up within a day, per "broker will contact the client"
        notes: `Client requested a visit via catalogue${input.preferredDate ? ` for ${input.preferredDate}` : ""}${input.preferredWindow ? ` (${input.preferredWindow})` : ""}.${input.message ? ` Note: ${input.message}` : ""}`,
      },
    });
  }

  if (input.type === "INTERESTED" || input.type === "VISIT_REQUESTED") {
    await recalculateLeadScore(catalogue.leadId, `CATALOGUE_${input.type}`);
  }

  return interaction;
}
