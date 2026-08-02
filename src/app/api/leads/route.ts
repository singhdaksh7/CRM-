import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { leadSchema } from "@/lib/validators";
import { generateCode } from "@/lib/utils";
import { logActivity } from "@/lib/activity";
import { getOrganizationId } from "@/lib/organization";
import { autoAssignLead } from "@/lib/assignment";
import { recalculateLeadScore } from "@/lib/scoring";
import { notifyRoles } from "@/lib/notifications";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const sp = req.nextUrl.searchParams;
    const where: Record<string, unknown> = { organizationId: getOrganizationId(session.user.id) };

    if (session.user.role === "FIELD_EXECUTIVE") {
      where.assignedToId = session.user.id;
    }

    const q = sp.get("q");
    if (q) {
      where.OR = [{ clientName: { contains: q } }, { phone: { contains: q } }, { leadCode: { contains: q } }];
    }
    const source = sp.get("source");
    if (source) where.source = source;
    const status = sp.get("status");
    if (status) where.status = status;
    const priority = sp.get("priority");
    if (priority) where.priority = priority;
    const assignedToId = sp.get("assignedToId");
    if (assignedToId) where.assignedToId = assignedToId === "unassigned" ? null : assignedToId;
    const location = sp.get("location");
    if (location) where.preferredLocation = location;
    const requirementType = sp.get("requirementType");
    if (requirementType) where.requirementType = requirementType;

    const leads = await prisma.lead.findMany({
      where,
      include: { assignedTo: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ leads });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const body = await req.json();
    const data = leadSchema.parse(body);
    const organizationId = getOrganizationId(session.user.id);
    const count = await prisma.lead.count({ where: { organizationId } });

    const lead = await prisma.lead.create({
      data: {
        ...data,
        organizationId,
        email: data.email || null,
        leadCode: generateCode("LEAD", count + 1),
        moveInDate: data.moveInDate ? new Date(data.moveInDate) : null,
      },
    });

    await logActivity({ leadId: lead.id, type: "LEAD_CREATED", description: `Lead manually created by ${session.user.name}`, actorId: session.user.id });

    if (lead.assignedToId) {
      await logActivity({ leadId: lead.id, type: "LEAD_ASSIGNED", description: "Assigned during creation", actorId: session.user.id });
    } else {
      await autoAssignLead(lead.id, organizationId);
    }

    await recalculateLeadScore(lead.id, "LEAD_CREATED");
    await notifyRoles(["ADMIN", "DATA_MANAGER"], {
      organizationId,
      type: "NEW_LEAD",
      title: "New lead received",
      message: `${lead.clientName} - ${lead.preferredLocation} (${data.source.replace(/_/g, " ")})`,
      leadId: lead.id,
    });

    const finalLead = await prisma.lead.findUnique({ where: { id: lead.id }, include: { assignedTo: true } });
    return NextResponse.json({ lead: finalLead }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
