import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { cancelVisitSchema } from "@/lib/validators";
import { cancelVisit } from "@/lib/visits";

/**
 * Admin / Data Manager cancel, with a required reason. A cancelled visit
 * leaves the active Today/Upcoming queues but stays fully visible in the
 * All Visits history.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    const { reason } = cancelVisitSchema.parse(await req.json());
    const visit = await cancelVisit(id, getOrganizationId(session.user), session.user, reason);
    return NextResponse.json({ visit });
  } catch (err) {
    return handleApiError(err);
  }
}
