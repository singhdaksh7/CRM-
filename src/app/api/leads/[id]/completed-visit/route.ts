import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { logCompletedVisitForLead } from "@/lib/visits";

const completedVisitSchema = z.object({
  propertyId: z.string().min(1),
  assignedToId: z.string().min(1),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  visitTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  notes: z.string().max(2000).optional().nullable(),
});

// POST /api/leads/[id]/completed-visit - the "No visit on record" corrective flow: records the visit that already
// happened as one COMPLETED Visit and moves the lead to VISIT_COMPLETED in a single transaction. Internal only -
// sends no WhatsApp/email/webhook. Same lead access rule as PATCH /api/leads/[id].
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const organizationId = getOrganizationId(session.user);
    const lead = await prisma.lead.findFirst({ where: { id, organizationId }, select: { id: true, assignedToId: true } });
    if (!lead) throw new ApiError(404, "Lead not found");
    if (session.user.role === "FIELD_EXECUTIVE" && lead.assignedToId !== session.user.id) throw new ApiError(403, "Forbidden");

    const data = completedVisitSchema.parse(await req.json());
    const visit = await logCompletedVisitForLead({ organizationId, leadId: id, actorId: session.user.id, ...data });
    return NextResponse.json({ visit: { id: visit.id, status: visit.status } }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
