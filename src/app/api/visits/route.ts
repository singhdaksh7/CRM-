import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { visitSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";
import { checkVisitConflict } from "@/lib/visit-conflict";
import { recordAudit } from "@/lib/audit";
import { scheduleVisit, visitRoleScopeWhere, upcomingVisitsWhere, todaysVisitsWhere } from "@/lib/visits";
import { startOfIstDay, endOfIstDay } from "@/lib/ist-date";
import { assignedToSelect } from "@/lib/user-select";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const sp = req.nextUrl.searchParams;
    const organizationId = getOrganizationId(session.user);

    // Org scope + role scope in one place. A FIELD_EXECUTIVE is pinned to
    // assignedToId - the person who must physically perform the visit - and
    // an explicit ?assignedToId= cannot widen that.
    const where: Prisma.VisitWhereInput = visitRoleScopeWhere(organizationId, session.user);

    const assignedToId = sp.get("assignedToId");
    if (assignedToId && session.user.role !== "FIELD_EXECUTIVE") where.assignedToId = assignedToId;

    const status = sp.get("status");
    if (status) where.status = status as Prisma.VisitWhereInput["status"];

    // "upcoming"/"today" are IST-anchored via the shared helpers rather than
    // recomputed here, so this endpoint and the pages can never disagree.
    const scope = sp.get("scope");
    if (scope === "upcoming") Object.assign(where, upcomingVisitsWhere(organizationId, new Date(), where.assignedToId as string | undefined));
    else if (scope === "today") Object.assign(where, todaysVisitsWhere(organizationId, new Date(), where.assignedToId as string | undefined));

    const date = sp.get("date");
    if (date) {
      // Anchor an explicit ?date=YYYY-MM-DD to the IST calendar day. The
      // previous `new Date(date).setHours(0,0,0,0)` used the SERVER's local
      // day, which on a UTC host silently shifted every boundary by 5h30m.
      const anchor = new Date(`${date}T12:00:00+05:30`);
      if (Number.isNaN(anchor.getTime())) throw new ApiError(400, "Invalid date filter");
      where.visitDate = { gte: startOfIstDay(anchor), lte: endOfIstDay(anchor) };
    }

    const visits = await prisma.visit.findMany({
      where,
      include: {
        lead: true,
        property: true,
        assignedTo: { select: assignedToSelect },
        properties: { include: { property: true }, orderBy: { sequence: "asc" } },
      },
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
    const { overrideConflict, overrideReason, propertyIds, catalogueShareId, ...data } = visitSchema.parse(body);
    const organizationId = getOrganizationId(session.user);

    // `propertyId` remains the primary/first property so existing single-
    // property callers are unchanged; `propertyIds` (when sent) is the full
    // ordered selection for a multi-property visit.
    const selectedPropertyIds = propertyIds && propertyIds.length > 0 ? [...new Set([data.propertyId, ...propertyIds])] : [data.propertyId];

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

    const visit = await scheduleVisit({
      organizationId,
      leadId: data.leadId,
      propertyIds: selectedPropertyIds,
      assignedToId: data.assignedToId,
      visitDate: new Date(data.visitDate),
      visitTime: data.visitTime,
      meetingLocation: data.meetingLocation,
      catalogueShareId,
      createdById: session.user.id,
      conflictData: {
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

    return NextResponse.json({ visit }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
