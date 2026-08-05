import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { listWhatsAppTemplates } from "@/integrations/whatsapp/whatsapp-templates";

export async function GET() {
  try {
    await requireSession();
    return NextResponse.json({ templates: listWhatsAppTemplates() });
  } catch (err) {
    return handleApiError(err);
  }
}
