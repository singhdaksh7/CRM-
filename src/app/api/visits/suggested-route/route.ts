import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { buildSuggestedRoute } from "@/lib/route-suggestion";
import { checkMapsQuota, rateLimitResponse } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";

/** Read-only "suggested route" (chronological stops + travel time between them) for one employee's day - see route-suggestion.ts for exactly what this is (and isn't). */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const sp = req.nextUrl.searchParams;
    const employeeId = sp.get("employeeId") ?? session.user.id;

    if (session.user.role === "FIELD_EXECUTIVE" && employeeId !== session.user.id) {
      throw new ApiError(403, "You can only view your own route");
    }

    const organizationId = getOrganizationId(session.user.id);
    const limitResult = await checkMapsQuota("mapsRouteSuggestion", session.user.id, organizationId);
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const dateParam = sp.get("date");
    const date = dateParam ? new Date(dateParam) : new Date();

    const route = await buildSuggestedRoute({ employeeId, organizationId, date });

    await recordAudit({
      userId: session.user.id,
      action: "OTHER",
      entityType: "Visit",
      newValues: { event: "suggested_route_generated", employeeId, stopCount: route.stops.length },
    });

    return NextResponse.json(route);
  } catch (err) {
    return handleApiError(err);
  }
}
