import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { logger } from "@/lib/logger";

/** A field executive may only view the internal details of a property they have an assigned visit for, or that appears in a catalogue for one of their assigned leads. */
async function fieldExecutiveHasAccess(propertyId: string, userId: string): Promise<boolean> {
  const [visit, catalogueMatch] = await Promise.all([
    prisma.visit.findFirst({ where: { propertyId, assignedToId: userId }, select: { id: true } }),
    prisma.catalogueShareProperty.findFirst({ where: { propertyId, catalogueShare: { lead: { assignedToId: userId } } }, select: { id: true } }),
  ]);
  return Boolean(visit || catalogueMatch);
}

/**
 * Objective 3 - Internal Property View. These fields must NEVER appear in
 * customer-facing catalogues (see toPublicCatalogueDTO, which never reads
 * any of them). Also writes a fire-and-forget PropertyViewLog row for
 * Objective 12's "Recently Viewed" feature - never blocks the response.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]);
    const { id } = await params;
    const organizationId = getOrganizationId(session.user.id);

    const property = await prisma.property.findFirst({
      where: { id, organizationId },
      include: { owner: true, partner: true },
    });
    if (!property) throw new ApiError(404, "Property not found");

    if (session.user.role === "FIELD_EXECUTIVE") {
      const hasAccess = await fieldExecutiveHasAccess(id, session.user.id);
      if (!hasAccess) throw new ApiError(403, "You don't have an assigned visit or lead catalogue involving this property");
    }

    prisma.propertyViewLog.create({ data: { userId: session.user.id, propertyId: id } }).catch((err) => {
      logger.warn("property_view_log_failed", { propertyId: id, message: err instanceof Error ? err.message : String(err) });
    });

    return NextResponse.json({
      property: {
        id: property.id,
        title: property.title,
        exactAddress: property.address,
        buildingName: property.buildingName,
        flatNumber: property.flatNumber,
        gateNumber: property.gateNumber,
        landmark: property.landmark,
        latitude: property.latitude,
        longitude: property.longitude,
        inventorySource: property.inventorySource,
        ownerName: property.inventorySource === "DIRECT" ? (property.owner?.name ?? property.ownerName) : null,
        ownerPhone: property.inventorySource === "DIRECT" ? (property.owner?.phone ?? property.ownerPhone) : null,
        partnerName: property.inventorySource === "INDIRECT" ? (property.partner?.name ?? null) : null,
        partnerPhone: property.inventorySource === "INDIRECT" ? (property.partner?.phone ?? null) : null,
        propertySource: property.propertySource,
        keyAvailability: property.keyAvailability,
        entryInstructions: property.entryInstructions,
        internalNotes: property.internalNotes,
        negotiationNotes: property.negotiationNotes,
        hiddenRemarks: property.hiddenRemarks,
        pendingVerification: property.pendingVerification,
        lastVerifiedAt: property.lastVerifiedAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
