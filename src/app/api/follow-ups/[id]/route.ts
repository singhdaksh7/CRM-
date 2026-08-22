import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { followUpSchema } from "@/lib/validators";
import { logActivity } from "@/lib/activity";
import { getOrganizationId } from "@/lib/organization";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const organizationId = getOrganizationId(session.user);

    // simplified-role-workflow security fix: this route previously did a bare
    // `findUnique({ where: { id } })` with no organizationId scope and no
    // FIELD_EXECUTIVE ownership check, so ANY authenticated user could PATCH
    // ANY follow-up by id - including one in a different organization or
    // owned by a different employee. Cross-org is now a 404 (never reveals
    // whether the id exists elsewhere), and a field executive who doesn't own
    // the follow-up is 403'd, matching assertLeadAccessible's pattern.
    const existing = await prisma.followUp.findFirst({ where: { id, organizationId } });
    if (!existing) throw new ApiError(404, "Follow-up not found");
    if (session.user.role === "FIELD_EXECUTIVE" && existing.ownerId !== session.user.id) {
      throw new ApiError(403, "Forbidden - this follow-up is not assigned to you");
    }

    const body = await req.json();
    const data = followUpSchema.partial().parse(body);

    const followUp = await prisma.followUp.update({
      where: { id },
      data: {
        ...data,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        completedAt: data.status === "COMPLETED" ? new Date() : data.status ? null : undefined,
      },
    });

    if (data.status === "COMPLETED" && existing.status !== "COMPLETED" && existing.leadId) {
      await logActivity({ leadId: existing.leadId, type: "FOLLOW_UP_COMPLETED", description: "Follow-up marked completed", actorId: session.user.id });
    }
    if (data.status === "CANCELLED" && existing.status !== "CANCELLED" && existing.leadId) {
      await logActivity({ leadId: existing.leadId, type: "STATUS_CHANGED", description: "Follow-up cancelled", actorId: session.user.id });
    }
    // A reschedule is "the same active row moved to a new date/time" - never
    // a second row - so Today's Work can never show a stale duplicate
    // alongside the moved one. Logged only when the date actually changed
    // (not on every incidental PATCH, e.g. a notes edit).
    if (data.dueDate && new Date(data.dueDate).getTime() !== existing.dueDate.getTime() && existing.leadId) {
      await logActivity({ leadId: existing.leadId, type: "STATUS_CHANGED", description: "Follow-up rescheduled", actorId: session.user.id });
    }

    return NextResponse.json({ followUp });
  } catch (err) {
    return handleApiError(err);
  }
}
