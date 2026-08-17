import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { recordAudit } from "@/lib/audit";
import { propertyPortalRegistry, type PropertyPortalProviderId } from "@/integrations/property-portals/registry";
import { listingActionState, type ListingAction } from "@/integrations/property-portals/listing-lifecycle";

const ACTIONS: ListingAction[] = ["PUBLISH", "UPDATE", "DEACTIVATE"];

/** Applies a capability-gated CRM-side state transition to a PortalListing.
 *  Because every provider in the contract-only registry is PARTNER_ACCESS_REQUIRED
 *  or UNKNOWN, this route can never actually publish/update/deactivate a real
 *  listing today - it will always return a truthful 409 with the blocking reason.
 *  The gating logic (listingActionState) is authoritative and identical to what
 *  a future authorized adapter would be required to honor. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const organizationId = getOrganizationId(session.user.id);
    const { id } = await params;
    const { action } = (await request.json()) as { action?: ListingAction };
    if (!action || !ACTIONS.includes(action)) return NextResponse.json({ error: "A valid action (PUBLISH, UPDATE, DEACTIVATE) is required" }, { status: 400 });

    const listing = await prisma.portalListing.findFirst({ where: { id, organizationId } });
    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

    const connection = listing.connectionId ? await prisma.propertyPortalConnection.findFirst({ where: { id: listing.connectionId, organizationId } }) : null;
    const connected = connection?.status === "CONNECTED";
    const capabilityKey = action === "PUBLISH" ? "supportsListingPublish" : action === "UPDATE" ? "supportsListingUpdate" : "supportsListingDeactivate";
    const capability = propertyPortalRegistry[listing.provider as PropertyPortalProviderId][capabilityKey];

    const state = listingActionState(action, capability, connected, listing.status);
    if (!state.allowed) {
      return NextResponse.json({ error: `Action not permitted: ${state.reason}`, reason: state.reason }, { status: 409 });
    }

    // Unreachable while the registry stays contract-only (capability never AVAILABLE),
    // kept correct and tested for the day an authorized adapter sets AVAILABLE.
    const nextStatus = action === "PUBLISH" ? "PUBLISHED" : action === "DEACTIVATE" ? "INACTIVE" : listing.status;
    const updated = await prisma.portalListing.update({
      where: { id: listing.id },
      data: { status: nextStatus, publishedAt: action === "PUBLISH" ? new Date() : listing.publishedAt, lastSyncedAt: new Date(), errorSummary: null },
    });
    await recordAudit({ userId: session.user.id, action: "UPDATE", entityType: "PortalListing", entityId: updated.id, newValues: { event: `PORTAL_LISTING_${action}`, provider: listing.provider } });
    return NextResponse.json({ listing: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
