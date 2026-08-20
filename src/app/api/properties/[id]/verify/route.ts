import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { recordAudit } from "@/lib/audit";
import { appendPropertyTimelineEvent } from "@/lib/property-timeline";

/**
 * Change 11 - "Property Last Verified". A lightweight positive-confirmation
 * action, distinct from reporting a problem (POST .../availability-report):
 * an executive who visits and confirms everything is still fine can record
 * that here. Feeds both the "Verified N days ago" badge and Inventory
 * Freshness (rules/inventory-freshness.ts).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]);
    const { id: propertyId } = await params;
    const organizationId = getOrganizationId(session.user);

    const property = await prisma.property.findFirst({ where: { id: propertyId, organizationId } });
    if (!property) throw new ApiError(404, "Property not found");

    const updated = await prisma.property.update({
      where: { id: propertyId },
      data: { lastVerifiedAt: new Date(), lastVerifiedById: session.user.id },
    });

    await prisma.activity.create({
      data: { type: "PROPERTY_VERIFIED", description: `${property.title} verified as still available`, actorId: session.user.id, metadata: JSON.stringify({ propertyId }) },
    });
    await recordAudit({ userId: session.user.id, action: "OTHER", entityType: "Property", entityId: propertyId, newValues: { event: "property_verified" } });
    await appendPropertyTimelineEvent({ organizationId, propertyId, eventType: "VERIFIED", actorId: session.user.id });

    return NextResponse.json({ property: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
