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
    const { leadId, ownerId, ...rest } = followUpSchema.partial().parse(body);

    // simplified-role-workflow (targeted fix pass, Blocker A) - leadId is
    // immutable after creation. This route previously wrote a client-supplied
    // leadId straight into the update with no re-validation at all (unlike
    // PATCH /api/visits/[id], which re-checks leadId/propertyId against the
    // caller's org before accepting them) - a caller who owns any follow-up
    // could repoint it at an arbitrary lead id, including one in a different
    // organization, and GET /api/follow-ups' `lead: true` include would then
    // surface that lead's full record. No known product need to move a
    // follow-up between leads was found (the UI never sends leadId on PATCH -
    // FollowUpsTab/NextActionAfterComplete/TodaysPrioritiesList all only send
    // status/dueDate/notes/ownerId), so this is rejected outright rather than
    // silently dropped, matching "clear error, not silent drop."
    if (leadId !== undefined && leadId !== existing.leadId) {
      throw new ApiError(400, "leadId cannot be changed after a follow-up is created");
    }

    // ownerId reassignment: a FIELD_EXECUTIVE may only ever keep/confirm
    // themself as owner - they must not be able to hand their own follow-up
    // to an arbitrary or unauthorized user. ADMIN/DATA_MANAGER keep their
    // existing ability to assign to anyone, but the target must still be a
    // real, active, same-organization employee - previously ANY string was
    // accepted with no existence/org check at all.
    if (ownerId !== undefined && ownerId !== null) {
      if (session.user.role === "FIELD_EXECUTIVE" && ownerId !== session.user.id) {
        throw new ApiError(403, "Field executives cannot reassign a follow-up to another employee");
      }
      const targetUser = await prisma.user.findFirst({
        where: { id: ownerId, organizationId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!targetUser) throw new ApiError(400, "Invalid owner - must be an active employee in your organization");
    }

    const followUp = await prisma.followUp.update({
      where: { id },
      data: {
        ...rest,
        ownerId: ownerId === undefined ? undefined : ownerId,
        dueDate: rest.dueDate ? new Date(rest.dueDate) : undefined,
        completedAt: rest.status === "COMPLETED" ? new Date() : rest.status ? null : undefined,
      },
    });

    if (rest.status === "COMPLETED" && existing.status !== "COMPLETED" && existing.leadId) {
      await logActivity({ leadId: existing.leadId, type: "FOLLOW_UP_COMPLETED", description: "Follow-up marked completed", actorId: session.user.id });
    }
    if (rest.status === "CANCELLED" && existing.status !== "CANCELLED" && existing.leadId) {
      await logActivity({ leadId: existing.leadId, type: "STATUS_CHANGED", description: "Follow-up cancelled", actorId: session.user.id });
    }
    // A reschedule is "the same active row moved to a new date/time" - never
    // a second row - so Today's Work can never show a stale duplicate
    // alongside the moved one. Logged only when the date actually changed
    // (not on every incidental PATCH, e.g. a notes edit).
    if (rest.dueDate && new Date(rest.dueDate).getTime() !== existing.dueDate.getTime() && existing.leadId) {
      await logActivity({
        leadId: existing.leadId,
        organizationId,
        type: "STATUS_CHANGED",
        description: `Follow-up rescheduled from ${existing.dueDate.toLocaleString("en-IN")} to ${new Date(rest.dueDate).toLocaleString("en-IN")}`,
        actorId: session.user.id,
      });
    }

    return NextResponse.json({ followUp });
  } catch (err) {
    return handleApiError(err);
  }
}
