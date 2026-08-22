import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { prepareCatalogueWhatsAppFallback } from "@/lib/catalogue-whatsapp-fallback";

const bodySchema = z.object({
  recipientPhone: z.string().min(8),
  clientFirstName: z.string().min(1),
  cataloguePublicUrl: z.string().url(),
  brokerageSignOff: z.string().max(80).optional(),
});

/**
 * Prepares a wa.me catalogue share link. Never sends WhatsApp.
 * Recipient number is passed explicitly (LeadPhone picker seam).
 */
export async function POST(req: NextRequest) {
  try {
    await requireSession(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]);
    const data = bodySchema.parse(await req.json());
    const prepared = prepareCatalogueWhatsAppFallback(data);
    if (!prepared) {
      return NextResponse.json({ error: "Invalid recipient phone number" }, { status: 400 });
    }
    return NextResponse.json(prepared);
  } catch (err) {
    return handleApiError(err);
  }
}
