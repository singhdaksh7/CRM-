import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { assertLeadAccessible } from "@/lib/lead-access";
import { getCatalogueById, sendCatalogue } from "@/lib/catalogues";
import { getOrganizationId } from "@/lib/organization";
import { getAllLeadPhoneNumbers } from "@/lib/lead-phones";
import { normalizeIndianPhone } from "@/integrations/whatsapp";
import { z } from "zod";
import { getWhatsAppConfigStatus } from "@/integrations/whatsapp/whatsapp-config";

const bodySchema = z.object({ recipientPhone: z.string().min(8), idempotencyKey: z.string().min(8).max(128).optional() });

/** Field Executives may send/share an already-created catalogue, but (per Phase 2B.11) may not create or revoke one. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; catalogueId: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]);
    if (!getWhatsAppConfigStatus().metaReady) throw new ApiError(503, "CRM WhatsApp sending is not configured. Use Open in WhatsApp instead.");
    const { id, catalogueId } = await params;
    await assertLeadAccessible(session, id);
    const organizationId = getOrganizationId(session.user);
    const body = bodySchema.parse(await req.json());
    const recipientPhone = normalizeIndianPhone(body.recipientPhone);
    if (!recipientPhone) throw new ApiError(400, "Select a valid Indian WhatsApp number");
    const leadPhones = await getAllLeadPhoneNumbers(organizationId, id);
    if (!leadPhones.some((phone) => normalizeIndianPhone(phone) === recipientPhone)) throw new ApiError(403, "Selected phone number does not belong to this lead");

    const existing = await getCatalogueById(catalogueId, organizationId);
    if (existing.leadId !== id) throw new ApiError(404, "Catalogue not found for this lead");

    const result = await sendCatalogue(catalogueId, organizationId, session.user.id, recipientPhone);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
