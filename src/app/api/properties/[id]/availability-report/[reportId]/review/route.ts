import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { availabilityReportReviewSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";
import { recordAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { appendPropertyTimelineEvent } from "@/lib/property-timeline";
import type { PropertyStatus, AvailabilityReportReason } from "@prisma/client";

// APPROVE maps the report's reason to an actual inventory status change.
// OWNER_UNREACHABLE/OTHER are left untouched - they don't imply a definite
// outcome, so an admin handles those manually after approving the report.
const REASON_TO_STATUS: Partial<Record<AvailabilityReportReason, PropertyStatus>> = {
  ALREADY_RENTED: "RENTED",
  ALREADY_SOLD: "SOLD",
  PROPERTY_LOCKED: "INACTIVE",
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; reportId: string }> }) {
  try {
    const session = await requireSession(["ADMIN"]);
    const { id: propertyId, reportId } = await params;
    const organizationId = getOrganizationId(session.user.id);

    const report = await prisma.propertyAvailabilityReport.findFirst({
      where: { id: reportId, propertyId, organizationId },
      include: { property: true },
    });
    if (!report) throw new ApiError(404, "Availability report not found");
    if (report.status !== "PENDING") throw new ApiError(409, "This report has already been reviewed");

    const data = availabilityReportReviewSchema.parse(await req.json());
    const approved = data.decision === "APPROVE";

    await prisma.propertyAvailabilityReport.update({
      where: { id: reportId },
      data: { status: approved ? "APPROVED" : "REJECTED", reviewedById: session.user.id, reviewedAt: new Date(), reviewNote: data.reviewNote ?? null },
    });

    const newStatus = approved ? REASON_TO_STATUS[report.reason] : undefined;
    await prisma.property.update({
      where: { id: propertyId },
      data: { pendingVerification: false, ...(newStatus ? { status: newStatus } : {}) },
    });

    await prisma.activity.create({
      data: {
        type: approved ? "PROPERTY_AVAILABILITY_APPROVED" : "PROPERTY_AVAILABILITY_REJECTED",
        description: approved
          ? `Availability report approved${newStatus ? ` - property marked ${newStatus}` : ""}`
          : "Availability report rejected - property restored",
        actorId: session.user.id,
        metadata: JSON.stringify({ propertyId, reportId }),
      },
    });
    await recordAudit({
      userId: session.user.id,
      action: "OTHER",
      entityType: "PropertyAvailabilityReport",
      entityId: reportId,
      newValues: { event: approved ? "availability_report_approved" : "availability_report_rejected", newStatus },
    });
    await appendPropertyTimelineEvent({
      organizationId,
      propertyId,
      eventType: approved ? "VERIFICATION_APPROVED" : "VERIFICATION_REJECTED",
      toValue: newStatus ?? undefined,
      note: data.reviewNote ?? undefined,
      actorId: session.user.id,
    });
    await createNotification({
      organizationId,
      userId: report.reportedById,
      type: approved ? "AVAILABILITY_REPORT_APPROVED" : "AVAILABILITY_REPORT_REJECTED",
      title: approved ? "Availability report approved" : "Availability report rejected",
      message: `${report.property.title} - your availability report was ${approved ? "approved" : "rejected"}.`,
      propertyId,
    });

    return NextResponse.json({ success: true, status: approved ? "APPROVED" : "REJECTED", newStatus: newStatus ?? null });
  } catch (err) {
    return handleApiError(err);
  }
}
