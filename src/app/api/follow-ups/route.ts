import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { followUpSchema } from "@/lib/validators";
import { logActivity } from "@/lib/activity";
import { getOrganizationId } from "@/lib/organization";
import { createNotification } from "@/lib/notifications";
import { assignedToSelect } from "@/lib/user-select";
import { assertLeadAccessible } from "@/lib/lead-access";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const sp = req.nextUrl.searchParams;
    const where: Record<string, unknown> = { organizationId: getOrganizationId(session.user) };
    if (session.user.role === "FIELD_EXECUTIVE") where.ownerId = session.user.id;

    const bucket = sp.get("bucket"); // overdue | today | upcoming
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    if (bucket === "overdue") where.dueDate = { lt: startOfToday };
    else if (bucket === "today") where.dueDate = { gte: startOfToday, lte: endOfToday };
    else if (bucket === "upcoming") where.dueDate = { gt: endOfToday };

    const status = sp.get("status");
    if (status) where.status = status;

    // simplified-role-workflow (targeted fix pass, Blocker A) - this
    // previously did `include: { lead: true }`, loading the ENTIRE Lead row
    // (score, notes, assignment reasoning, everything) for every follow-up in
    // the response, when the only consumer that reads follow-up.lead
    // (src/components/followups/followup-row.tsx) only ever renders
    // clientName. Narrowed to exactly what's rendered, plus leadId/phone for
    // parity with the same narrow shape src/lib/todays-work.ts already uses.
    const followUps = await prisma.followUp.findMany({
      where,
      include: {
        lead: { select: { id: true, clientName: true, phone: true } },
        owner: { select: assignedToSelect },
      },
      orderBy: { dueDate: "asc" },
    });
    return NextResponse.json({ followUps });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const data = followUpSchema.parse(body);
    const organizationId = getOrganizationId(session.user);

    // simplified-role-workflow security fix: this route previously created a
    // FollowUp for ANY leadId in the request body with no check that the
    // caller can actually access that lead - a field executive could attach
    // a follow-up to a lead assigned to a different employee (or, before
    // org-isolation, another organization's lead). assertLeadAccessible is
    // the same gate every other per-lead route uses; a field executive is
    // additionally required to own the assignment (writes stay stricter than
    // the read-only "Unassigned Leads" browsing tab, same policy as
    // POST /api/leads/[id]/phones).
    const lead = await assertLeadAccessible(session, data.leadId);
    if (session.user.role === "FIELD_EXECUTIVE" && lead.assignedToId !== session.user.id) {
      throw new ApiError(403, "Forbidden - this lead is not assigned to you");
    }

    const followUp = await prisma.followUp.create({ data: { ...data, organizationId, dueDate: new Date(data.dueDate) } });
    await logActivity({ leadId: data.leadId, type: "FOLLOW_UP_SCHEDULED", description: `${data.type.replace(/_/g, " ")} follow-up scheduled`, actorId: session.user.id });

    if (data.ownerId && data.ownerId !== session.user.id) {
      await createNotification({
        organizationId,
        userId: data.ownerId,
        type: "FOLLOW_UP_DUE",
        title: "Follow-up assigned to you",
        message: `${data.type.replace(/_/g, " ")} follow-up scheduled for ${new Date(data.dueDate).toLocaleString("en-IN")}`,
        leadId: data.leadId,
        followUpId: followUp.id,
      });
    }

    return NextResponse.json({ followUp }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
