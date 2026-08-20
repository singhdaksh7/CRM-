import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { startVisit } from "@/lib/visits";

/**
 * [Start Visit]. SCHEDULED -> IN_PROGRESS, stamps startedAt, writes an
 * activity + audit entry. Marks nothing as visited. Idempotent.
 *
 * Any signed-in role may call it, but loadVisitForActor inside startVisit
 * pins a FIELD_EXECUTIVE to visits where they are the assignee.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const visit = await startVisit(id, getOrganizationId(session.user), session.user);
    return NextResponse.json({ visit });
  } catch (err) {
    return handleApiError(err);
  }
}
