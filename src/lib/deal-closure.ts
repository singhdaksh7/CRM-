import type { LeadStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { recordAudit } from "./audit";
import { generateDealCode } from "./deals";

export interface MarkDealClosedParams {
  organizationId: string;
  leadId: string;
  propertyId?: string | null;
  closedByUserId: string;
  markedByUserId: string;
  closedAt?: Date | string | null;
  notes?: string | null;
}

export interface ReopenDealParams {
  organizationId: string;
  dealId: string;
  actorId: string;
  newStatus?: string; // e.g. "CONTACTED", "QUALIFIED", "NEGOTIATION"
}

export interface UpdateDealClosureParams {
  organizationId: string;
  dealId: string;
  actorId: string;
  closedByUserId?: string;
  propertyId?: string | null;
  closedAt?: Date | string | null;
  notes?: string | null;
}

/**
 * Marks a deal as CLOSED_WON / WON for a given lead with clean attribution:
 * - Lead Owner = lead.assignedToId
 * - Deal Closed By = closedByUserId (deal.assignedToId)
 * - Marked Closed By = markedByUserId (deal.createdById)
 * - Closed At = closedAt (defaults to now)
 * - Updates Lead status to CLOSED_WON
 * - Protects against duplicate concurrent calls
 * - Records Activity with attribution metadata and audit log
 */
export async function markLeadDealClosed(params: MarkDealClosedParams) {
  const { organizationId, leadId, propertyId, closedByUserId, markedByUserId, notes } = params;

  // 1. Verify lead belongs to org
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId },
    include: {
      assignedTo: { select: { id: true, name: true } },
    },
  });
  if (!lead) throw new ApiError(404, "Lead not found");

  // 2. Verify closer exists and belongs to org
  const closer = await prisma.user.findFirst({
    where: { id: closedByUserId, organizationId },
    select: { id: true, name: true },
  });
  if (!closer) throw new ApiError(404, "Deal closer employee not found");

  // 3. Verify marker exists and belongs to org
  const marker = await prisma.user.findFirst({
    where: { id: markedByUserId, organizationId },
    select: { id: true, name: true },
  });
  if (!marker) throw new ApiError(404, "Marker user not found");

  // 4. Verify property belongs to org if supplied
  let propertyTitle: string | null = null;
  if (propertyId) {
    const prop = await prisma.property.findFirst({
      where: { id: propertyId, organizationId },
      select: { id: true, title: true, propertyCode: true },
    });
    if (!prop) throw new ApiError(404, "Property not found");
    propertyTitle = prop.title;
  }

  // Parse closedAt date safely
  let parsedClosedAt = new Date();
  if (params.closedAt) {
    const d = new Date(params.closedAt);
    if (!Number.isNaN(d.getTime())) {
      parsedClosedAt = d;
    }
  }

  // 5. Atomic transaction to create or update Deal, update Lead, log Activity and Audit
  return await prisma.$transaction(async (tx) => {
    // Check if an existing Deal exists for this lead
    const existingDeal = await tx.deal.findFirst({
      where: { leadId, organizationId },
      orderBy: { createdAt: "desc" },
    });

    let deal;
    const dealCode = existingDeal ? existingDeal.dealCode : await generateDealCode(organizationId);

    if (existingDeal) {
      deal = await tx.deal.update({
        where: { id: existingDeal.id },
        data: {
          propertyId: propertyId !== undefined ? propertyId : existingDeal.propertyId,
          assignedToId: closedByUserId, // Deal Closed By
          createdById: markedByUserId,  // Marked Closed By
          closedAt: parsedClosedAt,
          status: "WON",
          stage: "CLOSED_WON",
          closingNotes: notes ?? existingDeal.closingNotes,
          notes: notes ?? existingDeal.notes,
        },
      });
    } else {
      deal = await tx.deal.create({
        data: {
          organizationId,
          dealCode,
          dealType: lead.transactionType === "SALE" ? "SALE" : "RENTAL",
          stage: "CLOSED_WON",
          status: "WON",
          leadId,
          propertyId: propertyId || null,
          assignedToId: closedByUserId, // Deal Closed By
          createdById: markedByUserId,  // Marked Closed By
          closedAt: parsedClosedAt,
          closingNotes: notes || null,
          notes: notes || null,
        },
      });
    }

    // Update lead status to CLOSED_WON
    await tx.lead.update({
      where: { id: leadId },
      data: { status: "CLOSED_WON" },
    });

    // If property was linked, optionally mark it rented/sold if listing type matches
    if (propertyId) {
      const prop = await tx.property.findUnique({ where: { id: propertyId }, select: { listingType: true } });
      if (prop) {
        await tx.property.update({
          where: { id: propertyId },
          data: { status: prop.listingType === "RENT" ? "RENTED" : "SOLD" },
        });
      }
    }

    const leadOwnerName = lead.assignedTo?.name ?? "Unassigned";

    // Append-only Activity log
    await tx.activity.create({
      data: {
        organizationId,
        leadId,
        dealId: deal.id,
        actorId: markedByUserId,
        type: "DEAL_CLOSED",
        description: `Deal marked Won by ${marker.name}. Closed by ${closer.name}.${lead.assignedTo ? ` Lead Owner: ${leadOwnerName}.` : ""}${propertyTitle ? ` Property: ${propertyTitle}.` : ""}`,
        metadata: JSON.stringify({
          dealId: deal.id,
          dealCode: deal.dealCode,
          closedByUserId: closer.id,
          closedByName: closer.name,
          markedByUserId: marker.id,
          markedByName: marker.name,
          leadOwnerId: lead.assignedToId,
          leadOwnerName,
          propertyId: propertyId || null,
          propertyTitle,
          closedAt: parsedClosedAt.toISOString(),
          notes: notes || null,
        }),
      },
    });

    // Audit log
    await recordAudit({
      userId: markedByUserId,
      action: existingDeal ? "UPDATE" : "CREATE",
      entityType: "Deal",
      entityId: deal.id,
      oldValues: existingDeal ? { status: existingDeal.status, stage: existingDeal.stage, assignedToId: existingDeal.assignedToId } : null,
      newValues: { status: deal.status, stage: deal.stage, assignedToId: deal.assignedToId, closedAt: deal.closedAt },
    });

    return deal;
  });
}

/**
 * Reopens a deal that was previously marked Won or Closed:
 * Sets deal status back to OPEN (or removes WON terminal),
 * and updates lead status back to an active status.
 */
export async function reopenDeal(params: ReopenDealParams) {
  const { organizationId, dealId, actorId, newStatus = "NEGOTIATION" } = params;

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, organizationId },
    include: {
      lead: { select: { id: true, clientName: true } },
    },
  });
  if (!deal) throw new ApiError(404, "Deal not found");

  const actor = await prisma.user.findFirst({
    where: { id: actorId, organizationId },
    select: { id: true, name: true },
  });
  if (!actor) throw new ApiError(404, "User not found");

  return await prisma.$transaction(async (tx) => {
    const updatedDeal = await tx.deal.update({
      where: { id: dealId },
      data: {
        status: "OPEN",
        stage: "NEGOTIATION",
      },
    });

    if (deal.leadId) {
      await tx.lead.update({
        where: { id: deal.leadId },
        data: { status: newStatus as LeadStatus },
      });

      await tx.activity.create({
        data: {
          organizationId,
          leadId: deal.leadId,
          dealId: deal.id,
          actorId,
          type: "STATUS_CHANGED",
          description: `Deal reopened by ${actor.name}. Status set to ${newStatus}.`,
          metadata: JSON.stringify({
            dealId: deal.id,
            reopenedByUserId: actor.id,
            reopenedByName: actor.name,
            previousStatus: deal.status,
            newStatus,
          }),
        },
      });
    }

    await recordAudit({
      userId: actorId,
      action: "UPDATE",
      entityType: "Deal",
      entityId: dealId,
      oldValues: { status: deal.status, stage: deal.stage },
      newValues: { status: "OPEN", stage: "NEGOTIATION" },
    });

    return updatedDeal;
  });
}

/**
 * Updates deal closure details (such as correcting closer employee, property, or date).
 */
export async function updateDealClosure(params: UpdateDealClosureParams) {
  const { organizationId, dealId, actorId, closedByUserId, propertyId, closedAt, notes } = params;

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, organizationId },
    include: { lead: true },
  });
  if (!deal) throw new ApiError(404, "Deal not found");

  const actor = await prisma.user.findFirst({
    where: { id: actorId, organizationId },
    select: { id: true, name: true },
  });
  if (!actor) throw new ApiError(404, "User not found");

  let parsedClosedAt: Date | undefined = undefined;
  if (closedAt) {
    const d = new Date(closedAt);
    if (!Number.isNaN(d.getTime())) {
      parsedClosedAt = d;
    }
  }

  let closerName = "";
  if (closedByUserId) {
    const closer = await prisma.user.findFirst({
      where: { id: closedByUserId, organizationId },
      select: { id: true, name: true },
    });
    if (!closer) throw new ApiError(404, "Assignee user not found");
    closerName = closer.name;
  }

  return await prisma.$transaction(async (tx) => {
    const updated = await tx.deal.update({
      where: { id: dealId },
      data: {
        ...(closedByUserId ? { assignedToId: closedByUserId } : {}),
        ...(propertyId !== undefined ? { propertyId } : {}),
        ...(parsedClosedAt ? { closedAt: parsedClosedAt } : {}),
        ...(notes !== undefined ? { closingNotes: notes, notes } : {}),
      },
    });

    if (deal.leadId) {
      await tx.activity.create({
        data: {
          organizationId,
          leadId: deal.leadId,
          dealId: deal.id,
          actorId,
          type: "STATUS_CHANGED",
          description: `Deal closure details corrected by ${actor.name}.${closerName ? ` Closed By updated to ${closerName}.` : ""}`,
          metadata: JSON.stringify({
            dealId: deal.id,
            updatedByUserId: actor.id,
            updatedByName: actor.name,
            closedByUserId,
            propertyId,
            closedAt: parsedClosedAt?.toISOString(),
          }),
        },
      });
    }

    await recordAudit({
      userId: actorId,
      action: "UPDATE",
      entityType: "Deal",
      entityId: dealId,
      oldValues: { assignedToId: deal.assignedToId, propertyId: deal.propertyId, closedAt: deal.closedAt },
      newValues: { assignedToId: updated.assignedToId, propertyId: updated.propertyId, closedAt: updated.closedAt },
    });

    return updated;
  });
}
