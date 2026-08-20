import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { searchPlacesValidated, MapsQueryTooShortError } from "@/lib/geocoding";
import { MapsConfigError, MapsProviderError } from "@/integrations/maps";
import { checkMapsQuota, rateLimitResponse } from "@/lib/rate-limit";
import { getOrganizationId } from "@/lib/organization";

/** Delhi-focused address-search suggestions for the property form. Client-side debouncing plus this route's own minimum query length keep this cheap. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const limitResult = await checkMapsQuota("mapsAutocomplete", session.user.id, getOrganizationId(session.user));
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const query = req.nextUrl.searchParams.get("q") ?? "";
    const results = await searchPlacesValidated(query);
    return NextResponse.json({ results });
  } catch (err) {
    if (err instanceof MapsQueryTooShortError) return NextResponse.json({ results: [] });
    if (err instanceof MapsConfigError) return NextResponse.json({ error: "Maps integration is not configured", results: [] }, { status: 503 });
    if (err instanceof MapsProviderError) return NextResponse.json({ error: "Address search is temporarily unavailable", results: [] }, { status: 502 });
    return handleApiError(err);
  }
}
