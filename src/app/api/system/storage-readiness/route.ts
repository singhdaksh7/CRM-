import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getStorageReadiness } from "@/lib/storage";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Read-only provider readiness. Never uploads a probe object.
 * Safe for Admin settings pages on every load.
 */
export async function GET() {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const limitResult = await checkRateLimit("document", session.user.id);
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const readiness = await getStorageReadiness();
    return NextResponse.json(readiness);
  } catch (err) {
    return handleApiError(err);
  }
}
