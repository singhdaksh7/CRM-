import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { recalculateLeadScore } from "@/lib/scoring";
import { getOrganizationId } from "@/lib/organization";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    // recalculateLeadScore() itself doesn't take organizationId (its other
    // callers all already source leadId from an org-scoped read) - this is
    // the one route that takes an id straight from the URL, so verify
    // ownership here before triggering a write.
    const owned = await prisma.lead.findFirst({ where: { id, organizationId: getOrganizationId(session.user.id) }, select: { id: true } });
    if (!owned) throw new ApiError(404, "Lead not found");
    const result = await recalculateLeadScore(id, "MANUAL_RECALCULATE");
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
