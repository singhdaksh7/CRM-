import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";
import { findNearbyProperties, isAllowedRadius, ALLOWED_RADIUS_METERS } from "@/lib/nearby-properties";

/** Properties near this one, within an allowed radius (1/3/5/10km). Never replaces the weighted lead-matching engine - this is a separate, simpler proximity browse. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const organizationId = getOrganizationId(session.user.id);

    const property = await prisma.property.findFirst({ where: { id, organizationId } });
    if (!property) throw new ApiError(404, "Property not found");
    if (property.latitude === null || property.longitude === null) {
      return NextResponse.json({ results: [], reason: "This property has no geocoded location yet." });
    }

    const radiusRaw = Number(req.nextUrl.searchParams.get("radiusMeters") ?? ALLOWED_RADIUS_METERS[1]);
    if (!isAllowedRadius(radiusRaw)) {
      throw new ApiError(400, `radiusMeters must be one of ${ALLOWED_RADIUS_METERS.join(", ")}`);
    }

    const results = await findNearbyProperties({
      organizationId,
      center: { latitude: property.latitude, longitude: property.longitude },
      radiusMeters: radiusRaw,
      listingType: property.listingType,
      excludePropertyId: property.id,
      take: 20,
    });

    return NextResponse.json({ results: results.map((r) => ({ property: r.property, distanceMeters: Math.round(r.distanceMeters) })) });
  } catch (err) {
    return handleApiError(err);
  }
}
