import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { assertLeadAccessible } from "@/lib/lead-access";
import { getOrganizationId } from "@/lib/organization";
import { getAllLeadPhoneNumbers } from "@/lib/lead-phones";
import { getCatalogueById, getPublicCatalogueUrl } from "@/lib/catalogues";
import { normalizeIndianPhone } from "@/integrations/whatsapp";
import { prepareCatalogueWhatsAppFallback } from "@/lib/catalogue-whatsapp-fallback";
import { logActivity } from "@/lib/activity";

const bodySchema = z.object({ recipientPhone: z.string().min(8) });

/** Prepares a manual WhatsApp link. It never calls a provider or claims delivery. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; catalogueId: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]);
    const { id, catalogueId } = await params;
    await assertLeadAccessible(session, id);
    const organizationId = getOrganizationId(session.user);
    const recipientPhone = normalizeIndianPhone(bodySchema.parse(await req.json()).recipientPhone);
    if (!recipientPhone) throw new ApiError(400, "Select a valid Indian WhatsApp number");
    const phones = await getAllLeadPhoneNumbers(organizationId, id);
    if (!phones.some((phone) => normalizeIndianPhone(phone) === recipientPhone)) throw new ApiError(403, "Selected phone number does not belong to this lead");
    const catalogue = await getCatalogueById(catalogueId, organizationId);
    if (catalogue.leadId !== id || catalogue.status !== "ACTIVE") throw new ApiError(404, "Active catalogue not found for this lead");
    const prepared = prepareCatalogueWhatsAppFallback({ recipientPhone, clientFirstName: catalogue.lead.clientName.split(" ")[0] || "there", cataloguePublicUrl: getPublicCatalogueUrl(catalogue.token), brokerageSignOff: catalogue.organization?.name });
    if (!prepared) throw new ApiError(400, "Select a valid Indian WhatsApp number");
    await logActivity({ leadId: id, organizationId, type: "WHATSAPP_OUTBOUND", description: `Catalogue "${catalogue.title}" opened for WhatsApp sharing`, actorId: session.user.id, metadata: { catalogueShareId: catalogue.id, recipient: `••••${recipientPhone.slice(-4)}`, state: "PREPARED" } });
    return NextResponse.json(prepared);
  } catch (err) { return handleApiError(err); }
}
