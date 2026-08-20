import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { propertyReportSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";
import { recordAudit } from "@/lib/audit";
import { notifyRoles } from "@/lib/notifications";

/** Objective 10 - general data-quality reporting (wrong rent/photos/area, owner not responding, duplicate, etc). Feeds the unified Property Issues Queue alongside PropertyAvailabilityReport. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]);
    const { id: propertyId } = await params;
    const organizationId = getOrganizationId(session.user);

    const property = await prisma.property.findFirst({ where: { id: propertyId, organizationId } });
    if (!property) throw new ApiError(404, "Property not found");

    const data = propertyReportSchema.parse(await req.json());

    const report = await prisma.propertyReport.create({
      data: { organizationId, propertyId, reportedById: session.user.id, type: data.type, note: data.note ?? null },
    });

    await prisma.activity.create({
      data: {
        type: "PROPERTY_REPORTED",
        description: `${property.title} reported: ${data.type.replace(/_/g, " ").toLowerCase()}`,
        actorId: session.user.id,
        metadata: JSON.stringify({ propertyId, reportId: report.id }),
      },
    });
    await recordAudit({
      userId: session.user.id,
      action: "OTHER",
      entityType: "PropertyReport",
      entityId: report.id,
      newValues: { event: "property_report_submitted", propertyId, type: data.type },
    });
    await notifyRoles(["ADMIN", "DATA_MANAGER"], {
      organizationId,
      type: "PROPERTY_REPORT_SUBMITTED",
      title: "Property issue reported",
      message: `${property.title} - ${data.type.replace(/_/g, " ").toLowerCase()}`,
      propertyId,
    });

    return NextResponse.json({ report }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
