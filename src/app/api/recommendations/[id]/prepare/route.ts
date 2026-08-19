import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { buildRecommendationMessage, buildClickToChatLink } from "@/lib/demand-whatsapp";
import { getPublicPropertyRecommendationUrl } from "@/lib/public-recommendation-dto";
import { formatINR } from "@/lib/utils";

// POST /api/recommendations/[id]/prepare - builds the editable WhatsApp
// message + click-to-chat link and moves the recommendation to PREPARED.
// ZERO AUTO-SEND (rule 26): this never calls a provider and never sets
// status to SENT - it only produces text a human reviews/edits before
// explicitly sending via [Send] (Meta) or [Open WhatsApp] (click-to-chat).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const organizationId = getOrganizationId(session.user.id);
    const { id } = await params;
    const recommendation = await prisma.propertyRecommendation.findFirst({
      where: { id, organizationId },
      include: { property: true, customerContact: true, lead: true },
    });
    if (!recommendation) throw new ApiError(404, "Recommendation not found");
    if (recommendation.customerContact?.doNotContact || recommendation.customerContact?.status === "DO_NOT_CONTACT") {
      throw new ApiError(409, "This contact is marked Do Not Contact - a recommendation cannot be prepared for them");
    }
    if (recommendation.customerContact?.whatsAppOptOut) {
      throw new ApiError(409, "This contact has opted out of WhatsApp - a recommendation cannot be prepared for them");
    }

    const recipientName = recommendation.customerContact?.name ?? recommendation.lead?.clientName ?? "there";
    const recipientPhone = recommendation.customerContact?.phone ?? recommendation.lead?.phone ?? null;
    const property = recommendation.property;
    const commercial = property.assetClass === "COMMERCIAL";
    const propertyTypeLabel = commercial ? property.propertyType.replace(/_/g, " ") : `${property.bhk} BHK`;
    const priceLabel = property.listingType === "RENT" ? formatINR(property.monthlyRent, { suffix: "month" })! : formatINR(property.salePrice, { compact: true })!;
    const publicUrl = getPublicPropertyRecommendationUrl(property.id);

    const message = buildRecommendationMessage({ customerName: recipientName, propertyTypeLabel, locality: property.area, priceLabel, publicUrl });
    const clickToChatUrl = recipientPhone ? buildClickToChatLink(recipientPhone, message) : null;

    const updated = await prisma.propertyRecommendation.update({
      where: { id },
      data: { status: "PREPARED", preparedAt: new Date(), channel: "WHATSAPP_CLICK_TO_CHAT" },
    });
    return NextResponse.json({ recommendation: updated, message, clickToChatUrl, publicUrl });
  } catch (err) {
    return handleApiError(err);
  }
}
