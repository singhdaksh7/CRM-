import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { visitSchema } from "@/lib/validators";
import { logActivity } from "@/lib/activity";
import { getOrganizationId } from "@/lib/organization";
import { recalculateLeadScore } from "@/lib/scoring";
import { createNotification } from "@/lib/notifications";
import { checkVisitConflict } from "@/lib/visit-conflict";
import { recordAudit } from "@/lib/audit";

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
    const { overrideConflict, overrideReason, ...data } = visitSchema.parse(body);
    const organizationId = getOrganizationId(session.user.id);

    let conflict: Awaited<ReturnType<typeof checkVisitConflict>> = { status: "NONE", detail: null, travelDurationMinutes: null, travelDistanceMeters: null, routeSource: "NONE" };
    if (data.assignedToId) {
      conflict = await checkVisitConflict({
        employeeId: data.assignedToId,
        organizationId,
        visitDate: new Date(data.visitDate),
        visitTime: data.visitTime,
        propertyId: data.propertyId,
      });
    }

    if (conflict.status === "WARNING" && !overrideConflict) {
      await recordAudit({
        userId: session.user.id,
        action: "OTHER",
        entityType: "Visit",
        newValues: { event: "visit_conflict_detected", employeeId: data.assignedToId, detail: conflict.detail },
      });
      return NextResponse.json({ conflict, requiresOverride: true }, { status: 409 });
    }
    if (conflict.status === "WARNING" && overrideConflict && !overrideReason) {
      throw new ApiError(400, "overrideReason is required to schedule a visit despite a detected conflict");
    }

    const visit = await prisma.visit.create({
      data: {
        ...data,
        organizationId,
        visitDate: new Date(data.visitDate),
        travelDurationMinutes: conflict.travelDurationMinutes,
        travelDistanceMeters: conflict.travelDistanceMeters,
        routeCheckedAt: conflict.routeSource !== "NONE" ? new Date() : null,
        routeSource: conflict.routeSource,
        conflictStatus: conflict.status === "WARNING" ? "OVERRIDDEN" : "NONE",
        conflictDetail: conflict.detail,
        conflictOverrideReason: conflict.status === "WARNING" ? overrideReason : null,
        conflictOverrideByUserId: conflict.status === "WARNING" ? session.user.id : null,
        conflictOverrideAt: conflict.status === "WARNING" ? new Date() : null,
      },
      include: { lead: true, property: true },
    });

    if (conflict.status === "WARNING") {
      await recordAudit({
        userId: session.user.id,
        action: "OTHER",
        entityType: "Visit",
        entityId: visit.id,
        newValues: { event: "visit_conflict_overridden", reason: overrideReason, detail: conflict.detail },
      });
    }

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
