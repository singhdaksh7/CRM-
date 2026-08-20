import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { assertLeadAccessible } from "@/lib/lead-access";
import { getCatalogueById } from "@/lib/catalogues";
import { catalogueExecutiveStatusSchema } from "@/lib/validators";
import { logActivity } from "@/lib/activity";
import { recordAudit } from "@/lib/audit";
import { appendPropertyTimelineEvent } from "@/lib/property-timeline";
import { getOrganizationId } from "@/lib/organization";

/**
 * Change 6 (Most Important) - the executive's per-property catalogue
 * engagement checklist: Showed / Customer liked / Shortlisted / Rejected.
 * Distinct from Visit.outcome - an executive can mark this straight from
 * the catalogue, independent of whether a physical visit happened yet.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; propertyId: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]);
    const { id, propertyId } = await params;
    const catalogue = await getCatalogueById(id);
    await assertLeadAccessible(session, catalogue.leadId);

    const cp = catalogue.properties.find((p) => p.propertyId === propertyId);
    if (!cp) throw new ApiError(404, "Property not found in this catalogue");

    const data = catalogueExecutiveStatusSchema.parse(await req.json());
    const organizationId = getOrganizationId(session.user);

    await prisma.catalogueShareProperty.update({
      where: { id: cp.id },
      data: {
        executiveStatus: data.executiveStatus,
        executiveStatusNote: data.note ?? null,
        executiveStatusUpdatedAt: new Date(),
        executiveStatusUpdatedById: session.user.id,
      },
    });

    const statusLabel = data.executiveStatus.replace(/_/g, " ").toLowerCase();
    await logActivity({
      leadId: catalogue.leadId,
      type: "CATALOGUE_PROPERTY_STATUS_UPDATED",
      description: `Property marked "${statusLabel}" in catalogue "${catalogue.title}"`,
      actorId: session.user.id,
      metadata: { propertyId, catalogueId: id },
    });
    await recordAudit({
      userId: session.user.id,
      action: "OTHER",
      entityType: "CatalogueShareProperty",
      entityId: cp.id,
      newValues: { event: "executive_status_updated", executiveStatus: data.executiveStatus },
    });
    await appendPropertyTimelineEvent({
      organizationId,
      propertyId,
      eventType: "CATALOGUE_PROPERTY_STATUS_UPDATED",
      toValue: data.executiveStatus,
      note: data.note ?? undefined,
      actorId: session.user.id,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
