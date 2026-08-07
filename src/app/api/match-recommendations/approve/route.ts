import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { getPublicCatalogueUrl } from "@/lib/catalogues";
import { logActivity } from "@/lib/activity";

/** Adds pending recommendations in one catalogue version, never sends WhatsApp. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { catalogueId, recommendationIds } = await req.json() as { catalogueId: string; recommendationIds: string[] };
    if (!catalogueId || !Array.isArray(recommendationIds) || recommendationIds.length === 0) throw new ApiError(400, "catalogueId and recommendationIds are required");
    const organizationId = getOrganizationId(session.user.id);
    const catalogue = await prisma.catalogueShare.findFirst({ where: { id: catalogueId, organizationId, status: "ACTIVE" }, include: { properties: true, lead: true } });
    if (!catalogue) throw new ApiError(404, "Active catalogue not found");
    const recommendations = await prisma.matchRecommendation.findMany({ where: { id: { in: recommendationIds }, organizationId, leadId: catalogue.leadId, status: "PENDING" }, include: { property: true } });
    if (recommendations.length !== new Set(recommendationIds).size) throw new ApiError(400, "Recommendations must be pending and belong to this catalogue lead");
    const additions = recommendations.filter((r) => r.property.status === "AVAILABLE" && !catalogue.properties.some((p) => p.propertyId === r.propertyId && !p.removedAt));
    const nextVersion = additions.length ? catalogue.version + 1 : catalogue.version;
    await prisma.$transaction(async (tx) => {
      if (additions.length) {
        await tx.catalogueShareProperty.createMany({ data: additions.map((r, index) => ({ catalogueShareId: catalogue.id, propertyId: r.propertyId, sortOrder: catalogue.properties.length + index, priceVisible: true, addressVisible: false, brokerageVisible: false, addedManually: true, addedByUserId: session.user.id })), skipDuplicates: true });
        await tx.catalogueShare.update({ where: { id: catalogue.id }, data: { version: nextVersion } });
        await tx.catalogueVersionEvent.createMany({ data: additions.map((r) => ({ organizationId, catalogueShareId: catalogue.id, version: nextVersion, changeType: "PROPERTY_ADDED", propertyId: r.propertyId, reason: "NEW_MATCH_AVAILABLE", actorId: session.user.id })) });
      }
      await tx.matchRecommendation.updateMany({ where: { id: { in: recommendations.map((r) => r.id) } }, data: { status: "ADDED_TO_CATALOGUE", handledById: session.user.id } });
    });
    await logActivity({ leadId: catalogue.leadId, type: "CATALOGUE_VERSION_CHANGED", description: `${additions.length} new match${additions.length === 1 ? "" : "es"} added to catalogue v${nextVersion}; WhatsApp update prepared only`, actorId: session.user.id, metadata: { catalogueId, recommendationIds, version: nextVersion } });
    const firstName = catalogue.lead.clientName.split(" ")[0];
    const message = additions.length === 1 ? `Hi ${firstName} Ji,\n\nA new property matching your requirement has been added to your updated catalogue.\n\nView photos and full details:\n${getPublicCatalogueUrl(catalogue.token)}\n\nPlease let me know if you'd like to schedule a visit.\n\n— KP Properties` : `Hi ${firstName} Ji,\n\nWe've found ${additions.length} new properties matching your requirement and added them to your updated catalogue.\n\nView the latest options with photos and details:\n${getPublicCatalogueUrl(catalogue.token)}\n\n— KP Properties`;
    return NextResponse.json({ version: nextVersion, added: additions.length, suggestedWhatsAppMessage: message, sent: false });
  } catch (err) { return handleApiError(err); }
}
