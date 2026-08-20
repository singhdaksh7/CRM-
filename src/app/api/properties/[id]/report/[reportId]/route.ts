import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { propertyReportResolveSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";
import { recordAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; reportId: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id: propertyId, reportId } = await params;
    const organizationId = getOrganizationId(session.user);

    const report = await prisma.propertyReport.findFirst({ where: { id: reportId, propertyId, organizationId }, include: { property: true } });
    if (!report) throw new ApiError(404, "Property report not found");
    if (report.status !== "PENDING") throw new ApiError(409, "This report has already been resolved");

    const data = propertyReportResolveSchema.parse(await req.json());

    await prisma.propertyReport.update({
      where: { id: reportId },
      data: { status: data.status, resolvedById: session.user.id, resolvedAt: new Date(), resolutionNote: data.resolutionNote ?? null },
    });

    await prisma.activity.create({
      data: {
        type: "PROPERTY_REPORT_RESOLVED",
        description: `${report.property.title} report ${data.status.toLowerCase()}`,
        actorId: session.user.id,
        metadata: JSON.stringify({ propertyId, reportId }),
      },
    });
    await recordAudit({
      userId: session.user.id,
      action: "OTHER",
      entityType: "PropertyReport",
      entityId: reportId,
      newValues: { event: "property_report_resolved", status: data.status },
    });
    await createNotification({
      organizationId,
      userId: report.reportedById,
      type: "PROPERTY_REPORT_RESOLVED",
      title: "Your property report was reviewed",
      message: `${report.property.title} - marked ${data.status.toLowerCase()}.`,
      propertyId,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
