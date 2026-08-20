import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { bulkAutoAssign } from "@/lib/assignment";
import { getOrganizationId } from "@/lib/organization";

/**
 * Bulk-assigns every currently-unassigned lead (or an explicit `leadIds`
 * list, if provided) in one call - the "Run Auto Assignment" bulk action on
 * the leads page.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const organizationId = getOrganizationId(session.user);
    const body = await req.json().catch(() => ({}));

    const leadIds: string[] = Array.isArray(body.leadIds) && body.leadIds.length > 0
      ? body.leadIds
      : (await prisma.lead.findMany({
          where: { organizationId, assignedToId: null, status: { notIn: ["CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"] } },
          select: { id: true },
        })).map((l) => l.id);

    const outcomes = await bulkAutoAssign(leadIds, organizationId);
    const assignedCount = outcomes.filter((o) => o.assigned).length;

    return NextResponse.json({ total: leadIds.length, assigned: assignedCount, outcomes });
  } catch (err) {
    return handleApiError(err);
  }
}
