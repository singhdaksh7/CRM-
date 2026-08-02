import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { visitSchema } from "@/lib/validators";
import { logActivity } from "@/lib/activity";
import { getOrganizationId } from "@/lib/organization";
import { recalculateLeadScore } from "@/lib/scoring";
import { createNotification } from "@/lib/notifications";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const sp = req.nextUrl.searchParams;
    const where: Record<string, unknown> = { organizationId: getOrganizationId(session.user.id) };
    if (session.user.role === "FIELD_EXECUTIVE") where.assignedToId = session.user.id;

    const assignedToId = sp.get("assignedToId");
    if (assignedToId) where.assignedToId = assignedToId;
    const status = sp.get("status");
    if (status) where.status = status;
    const date = sp.get("date");
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      where.visitDate = { gte: start, lte: end };
    }

    const visits = await prisma.visit.findMany({
      where,
      include: { lead: true, property: true, assignedTo: true },
      orderBy: { visitDate: "asc" },
    });
    return NextResponse.json({ visits });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const body = await req.json();
    const data = visitSchema.parse(body);
    const organizationId = getOrganizationId(session.user.id);

    const visit = await prisma.visit.create({
      data: { ...data, organizationId, visitDate: new Date(data.visitDate) },
      include: { lead: true, property: true },
    });

    await logActivity({ leadId: data.leadId, type: "VISIT_SCHEDULED", description: `Visit scheduled for ${data.visitDate} at ${data.visitTime}`, actorId: session.user.id });
    await prisma.lead.update({ where: { id: data.leadId }, data: { status: "VISIT_SCHEDULED" } });
    await recalculateLeadScore(data.leadId, "VISIT_SCHEDULED");

    if (data.assignedToId) {
      await createNotification({
        organizationId,
        userId: data.assignedToId,
        type: "VISIT_SCHEDULED",
        title: "New visit scheduled",
        message: `${visit.lead.clientName} - ${visit.property.title} on ${data.visitDate} at ${data.visitTime}`,
        leadId: data.leadId,
        visitId: visit.id,
        propertyId: data.propertyId,
      });
    }

    return NextResponse.json({ visit }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
