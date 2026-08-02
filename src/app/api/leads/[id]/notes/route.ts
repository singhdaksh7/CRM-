import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity";
import { getOrganizationId } from "@/lib/organization";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const { note } = await req.json();
    if (!note?.trim()) throw new ApiError(400, "note is required");

    const organizationId = getOrganizationId(session.user.id);
    const lead = await prisma.lead.findFirst({ where: { id, organizationId } });
    if (!lead) throw new ApiError(404, "Lead not found");
    if (session.user.role === "FIELD_EXECUTIVE" && lead.assignedToId !== session.user.id) {
      throw new ApiError(403, "Forbidden");
    }

    const combined = lead.notes ? `${lead.notes}\n\n[${new Date().toLocaleString("en-IN")} - ${session.user.name}]: ${note}` : `[${new Date().toLocaleString("en-IN")} - ${session.user.name}]: ${note}`;
    const updated = await prisma.lead.update({ where: { id }, data: { notes: combined } });
    await logActivity({ leadId: id, type: "NOTE_ADDED", description: note, actorId: session.user.id });

    return NextResponse.json({ lead: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
