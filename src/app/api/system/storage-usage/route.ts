import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { getStorageUsageSummary } from "@/lib/storage-usage";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

/** Admin storage summary from DB metadata - no bucket scan. */
export async function GET() {
  try {
    const session = await requireSession(["ADMIN"]);
    const limitResult = await checkRateLimit("document", session.user.id);
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const summary = await getStorageUsageSummary(getOrganizationId(session.user.id));
    return NextResponse.json(summary);
  } catch (err) {
    return handleApiError(err);
  }
}
