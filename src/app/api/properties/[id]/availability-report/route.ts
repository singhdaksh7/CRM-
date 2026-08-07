import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { availabilityReportSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";
import { recordAudit } from "@/lib/audit";
import { notifyRoles } from "@/lib/notifications";
import { appendPropertyTimelineEvent } from "@/lib/property-timeline";

/**
 * Objective 7, Change 3 - Property Availability Verification. Photo
 * evidence is REQUIRED (not just documented as required) - photoId must
 * reference a real PropertyImage with purpose AVAILABILITY_REPORT
 * belonging to this property, uploaded beforehand via
 * POST /api/properties/[id]/images with purpose=AVAILABILITY_REPORT. This
 * prevents fake/lazy reports.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]);
    const { id: propertyId } = await params;
    const organizationId = getOrganizationId(session.user.id);

    const property = await prisma.property.findFirst({ where: { id: propertyId, organizationId } });
    if (!property) throw new ApiError(404, "Property not found");

    const data = availabilityReportSchema.parse(await req.json());

    const photo = await prisma.propertyImage.findFirst({
      where: { id: data.photoId, propertyId, purpose: "AVAILABILITY_REPORT", status: "ACTIVE" },
    });
    if (!photo) throw new ApiError(400, "A valid evidence photo is required - upload one first via POST /api/properties/[id]/images with purpose=AVAILABILITY_REPORT");

    if (data.visitId) {
      const visit = await prisma.visit.findFirst({ where: { id: data.visitId, propertyId } });
      if (!visit) throw new ApiError(400, "visitId does not refer to a visit for this property");
    }

    const report = await prisma.propertyAvailabilityReport.create({
      data: {
        organizationId,
        propertyId,
        visitId: data.visitId ?? null,
        reportedById: session.user.id,
        reason: data.reason,
        note: data.note ?? null,
        photoId: data.photoId,
      },
    });

    await prisma.property.update({ where: { id: propertyId }, data: { pendingVerification: true } });

    // Activity has no propertyId FK (only lead/crmOwner/deal/inventoryPartner) -
    // this event isn't scoped to any of those, so it's written directly
    // rather than through logActivity (which requires a leadId).
    await prisma.activity.create({
      data: {
        type: "PROPERTY_AVAILABILITY_REPORTED",
        description: `Availability report submitted for "${property.title}": ${data.reason.replace(/_/g, " ").toLowerCase()}`,
        actorId: session.user.id,
        metadata: JSON.stringify({ propertyId, reportId: report.id }),
      },
    });
    await recordAudit({
      userId: session.user.id,
      action: "OTHER",
      entityType: "PropertyAvailabilityReport",
      entityId: report.id,
      newValues: { event: "availability_report_submitted", propertyId, reason: data.reason },
    });
    await appendPropertyTimelineEvent({
      organizationId,
      propertyId,
      eventType: "MARKED_UNAVAILABLE",
      toValue: data.reason,
      note: data.note ?? undefined,
      actorId: session.user.id,
    });
    await notifyRoles(["ADMIN", "DATA_MANAGER"], {
      organizationId,
      type: "AVAILABILITY_REPORT_SUBMITTED",
      title: "Property availability reported",
      message: `${property.title} - ${data.reason.replace(/_/g, " ").toLowerCase()}, pending review.`,
      propertyId,
    });

    return NextResponse.json({ report }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
