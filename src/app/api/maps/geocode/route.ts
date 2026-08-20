import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { geocodeAddressCached, MapsQueryTooShortError } from "@/lib/geocoding";
import { MapsConfigError, MapsProviderError } from "@/integrations/maps";
import { checkMapsQuota, rateLimitResponse } from "@/lib/rate-limit";
import { getOrganizationId } from "@/lib/organization";

/**
 * Previews geocode results for a raw address query - used by the property
 * form before a property exists yet (so it can't be tied to a propertyId
 * the way POST /api/properties/[id]/geocode is). Selecting a result there
 * only fills form fields client-side; nothing is saved until the property
 * itself is created/updated.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const limitResult = await checkMapsQuota("mapsGeocode", session.user.id, getOrganizationId(session.user));
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const query = req.nextUrl.searchParams.get("q") ?? "";
    const results = await geocodeAddressCached(query);
    return NextResponse.json({ results });
  } catch (err) {
    if (err instanceof MapsQueryTooShortError) return NextResponse.json({ results: [] });
    if (err instanceof MapsConfigError) return NextResponse.json({ error: "Maps integration is not configured", results: [] }, { status: 503 });
    if (err instanceof MapsProviderError) return NextResponse.json({ error: "Geocoding is temporarily unavailable", results: [] }, { status: 502 });
    return handleApiError(err);
  }
}
