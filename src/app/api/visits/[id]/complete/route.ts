import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { completeVisitSchema } from "@/lib/validators";
import { completeVisit } from "@/lib/visits";

/**
 * [Complete Visit]. Requires every visit property resolved, captures the
 * optional overall 1-5 client interest and an optional summary, transitions
 * IN_PROGRESS -> COMPLETED and stamps completedAt. Optionally marks the
 * client's preferred properties in the same call.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const input = completeVisitSchema.parse(await req.json().catch(() => ({})));
    const visit = await completeVisit(id, getOrganizationId(session.user), session.user, input);
    return NextResponse.json({ visit });
  } catch (err) {
    return handleApiError(err);
  }
}
