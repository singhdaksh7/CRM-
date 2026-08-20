import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { assertLeadAccessible } from "@/lib/lead-access";
import { getCatalogueById } from "@/lib/catalogues";
import { getOrganizationId } from "@/lib/organization";
import { logActivity } from "@/lib/activity";

/**
 * Change 10 - catalogue versioning. Removing a property from an
 * already-sent catalogue is a soft-removal (never a hard delete -
 * CatalogueInteraction rows reference propertyId and must stay valid),
 * plus a version bump and an append-only CatalogueVersionEvent. The public
 * token/link never changes - both toPublicCatalogueDTO and
 * toExecutiveCatalogueDTO filter on removedAt:null, so "the client always
 * opens the latest version" falls out naturally from the same stable link.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; propertyId: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id, propertyId } = await params;
    // This route previously had NO lead/org ownership check at all before
    // mutating a catalogue by id - getCatalogueById's own organizationId
    // enforcement now closes that (a cross-org id 404s), and
    // assertLeadAccessible restores the same lead-assignment scoping every
    // other catalogue-mutation route already has.
    const catalogue = await getCatalogueById(id, getOrganizationId(session.user));
    await assertLeadAccessible(session, catalogue.leadId);

    const cp = catalogue.properties.find((p) => p.propertyId === propertyId);
    if (!cp) throw new ApiError(404, "Property not found in this catalogue");
    if (cp.removedAt) throw new ApiError(409, "Property was already removed from this catalogue");

    const body = await req.json().catch(() => ({}));
    const reason = typeof body?.reason === "string" ? body.reason : null;
    const nextVersion = catalogue.version + 1;

    await prisma.$transaction([
      prisma.catalogueShareProperty.update({ where: { id: cp.id }, data: { removedAt: new Date(), removedReason: reason } }),
      prisma.catalogueShare.update({ where: { id }, data: { version: nextVersion } }),
      prisma.catalogueVersionEvent.create({
        data: { organizationId: catalogue.organizationId, catalogueShareId: id, version: nextVersion, changeType: "PROPERTY_REMOVED", propertyId, reason, actorId: session.user.id },
      }),
    ]);

    await logActivity({
      leadId: catalogue.leadId,
      type: "CATALOGUE_VERSION_CHANGED",
      description: `Property removed from catalogue "${catalogue.title}" (now v${nextVersion})`,
      actorId: session.user.id,
      metadata: { propertyId, version: nextVersion },
    });

    return NextResponse.json({ success: true, version: nextVersion });
  } catch (err) {
    return handleApiError(err);
  }
}
