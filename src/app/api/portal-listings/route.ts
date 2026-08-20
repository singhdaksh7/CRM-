import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { recordAudit } from "@/lib/audit";
import { PROPERTY_PORTAL_PROVIDERS, type PropertyPortalProviderId } from "@/integrations/property-portals/registry";

/** Creates (or returns the existing) DRAFT distribution record for a property on a provider.
 *  No external network call is made: this only records CRM-side intent to distribute. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const organizationId = getOrganizationId(session.user);
    const { propertyId, provider } = (await request.json()) as { propertyId?: string; provider?: string };
    if (!propertyId || !provider || !PROPERTY_PORTAL_PROVIDERS.includes(provider as PropertyPortalProviderId)) {
      return NextResponse.json({ error: "A valid propertyId and provider are required" }, { status: 400 });
    }
    const property = await prisma.property.findFirst({ where: { id: propertyId, organizationId } });
    if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });

    const existing = await prisma.portalListing.findFirst({ where: { organizationId, propertyId, provider: provider as PropertyPortalProviderId } });
    if (existing) return NextResponse.json({ listing: existing });

    const connection = await prisma.propertyPortalConnection.findFirst({ where: { organizationId, provider: provider as PropertyPortalProviderId } });
    const listing = await prisma.portalListing.create({
      data: { organizationId, propertyId, provider: provider as PropertyPortalProviderId, connectionId: connection?.id ?? null, status: "DRAFT" },
    });
    await recordAudit({ userId: session.user.id, action: "CREATE", entityType: "PortalListing", entityId: listing.id, newValues: { event: "PORTAL_LISTING_DRAFT_CREATED", provider, propertyId } });
    return NextResponse.json({ listing }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
