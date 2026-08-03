import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { geocodeProperty } from "@/lib/property-location";
import { checkMapsQuota, rateLimitResponse } from "@/lib/rate-limit";
import { getOrganizationId } from "@/lib/organization";

/** Explicit, user-triggered geocode/re-geocode of a property's existing address fields. Never runs automatically. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;

    const limitResult = await checkMapsQuota("mapsReverify", session.user.id, getOrganizationId(session.user.id));
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const property = await geocodeProperty({ propertyId: id, actorId: session.user.id, role: session.user.role });
    return NextResponse.json({ property });
  } catch (err) {
    return handleApiError(err);
  }
}
