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
    // This legacy generic endpoint cannot establish catalogue/lead ownership.
    // Call the lead-bound route instead; fail closed rather than trusting IDs,
    // phone data, or a public URL supplied by a browser.
    bodySchema.parse(await req.json());
    return NextResponse.json({ error: "Use the catalogue share action to prepare WhatsApp." }, { status: 410 });
  } catch (err) {
    return handleApiError(err);
  }
}
