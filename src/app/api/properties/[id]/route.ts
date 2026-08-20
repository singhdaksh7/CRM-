import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { propertySchema } from "@/lib/validators";
import { notifyAffectedCataloguesOfPropertyChange } from "@/lib/property-share-alerts";
import { logger } from "@/lib/logger";
import { appendPropertyTimelineEvent } from "@/lib/property-timeline";
import { getOrganizationId } from "@/lib/organization";
import { shouldRematchProperty } from "@/lib/property-rematch";
import { recommendPropertyToWaitingLeads } from "@/lib/match-recommendations";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const property = await prisma.property.findFirst({ where: { id, organizationId: getOrganizationId(session.user) } });
    if (!property) throw new ApiError(404, "Property not found");
    return NextResponse.json({ property });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    const body = await req.json();
    const { amenities, images, availableFrom, ...data } = propertySchema.partial().parse(body);
    const existing = await prisma.property.findFirst({ where: { id, organizationId: getOrganizationId(session.user) } });
    if (!existing) throw new ApiError(404, "Property not found");
    const property = await prisma.property.update({
      where: { id },
      data: {
        ...data,
        ...(amenities ? { amenities: JSON.stringify(amenities) } : {}),
        ...(images ? { images: JSON.stringify(images) } : {}),
        // Phase 4 - photo-freshness signal for property health, distinct from
        // the generic updatedAt (which changes on ANY edit, not just photos).
        ...(images || data.coverImage !== undefined ? { imagesUpdatedAt: new Date() } : {}),
        ...(availableFrom !== undefined ? { availableFrom: availableFrom ? new Date(availableFrom) : null } : {}),
        // A coordinate submitted alongside a placeId came from the address
        // search's confirmed geocode result (see property-address-search.tsx).
        ...(data.latitude != null && data.placeId ? { geocodeStatus: "SUCCESS" as const, geocodedAt: new Date() } : {}),
      } as never,
    });

    // Best-effort: a property becoming unavailable or changing price after
    // it was already shared with a client shouldn't silently go unnoticed by
    // whoever built that catalogue. Never let this alerting fail the update.
    if (existing) {
      if (shouldRematchProperty(existing, property)) {
        // Internal recommendation only; it never invokes WhatsApp or mutates a catalogue.
        void recommendPropertyToWaitingLeads(property.id, `property:${property.id}:${property.updatedAt.toISOString()}`);
      }
      try {
        if (data.status && data.status !== "AVAILABLE" && data.status !== existing.status) {
          await notifyAffectedCataloguesOfPropertyChange(id, "UNAVAILABLE");
        }
        const priceChanged =
          (data.monthlyRent !== undefined && data.monthlyRent !== existing.monthlyRent) ||
          (data.salePrice !== undefined && data.salePrice !== existing.salePrice);
        if (priceChanged) {
          await notifyAffectedCataloguesOfPropertyChange(id, "PRICE_CHANGED");
        }
      } catch (err) {
        logger.error("property_share_alert_failed", { propertyId: id, message: err instanceof Error ? err.message : String(err) });
      }

      // Phase 4, Objective 8 - complete property history, not just
      // inventory-status changes. One event per kind of change actually
      // made in this request, not a generic catch-all.
      const organizationId = getOrganizationId(session.user);
      if (data.status && data.status !== existing.status) {
        await appendPropertyTimelineEvent({ organizationId, propertyId: id, eventType: "STATUS_CHANGED", fromValue: existing.status, toValue: data.status, actorId: session.user.id });
      }
      if (data.monthlyRent !== undefined && data.monthlyRent !== existing.monthlyRent) {
        await appendPropertyTimelineEvent({ organizationId, propertyId: id, eventType: "RENT_UPDATED", fromValue: existing.monthlyRent?.toString(), toValue: data.monthlyRent?.toString(), actorId: session.user.id });
      }
      if (data.salePrice !== undefined && data.salePrice !== existing.salePrice) {
        await appendPropertyTimelineEvent({ organizationId, propertyId: id, eventType: "PRICE_UPDATED", fromValue: existing.salePrice?.toString(), toValue: data.salePrice?.toString(), actorId: session.user.id });
      }
    }

    return NextResponse.json({ property });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    const existing = await prisma.property.findFirst({ where: { id, organizationId: getOrganizationId(session.user) } });
    if (!existing) throw new ApiError(404, "Property not found");
    await prisma.property.update({ where: { id }, data: { status: "INACTIVE" } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
