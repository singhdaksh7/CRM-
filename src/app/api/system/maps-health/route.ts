import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getMapsProvider } from "@/integrations/maps";
import { getMapsCapabilitiesDTO } from "@/lib/maps-capabilities";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

/**
 * Admin-only diagnostics - one cheap geocode of a fixed, well-known Delhi
 * landmark to confirm the server key/provider are actually reachable.
 * Rate-limited so this can't be triggered repeatedly to rack up API cost.
 * Never exposes the key or a raw provider payload.
 */
export async function POST() {
  try {
    const session = await requireSession(["ADMIN"]);
    const limitResult = await checkRateLimit("mapsTestConnection", session.user.id);
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const provider = getMapsProvider();
    const diagnostics = await provider.getDiagnostics();

    await recordAudit({
      userId: session.user.id,
      action: "OTHER",
      entityType: "MapsProvider",
      newValues: { event: "maps_health_check", provider: provider.name, ok: diagnostics.ok },
    });
    logger.info("maps_health_check", { actorId: session.user.id, provider: provider.name, ok: diagnostics.ok });

    return NextResponse.json({ ...getMapsCapabilitiesDTO(), ok: diagnostics.ok, details: diagnostics.details });
  } catch (err) {
    return handleApiError(err);
  }
}
