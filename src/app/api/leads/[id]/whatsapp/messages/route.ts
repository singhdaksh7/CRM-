import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { assertLeadAccessible } from "@/lib/lead-access";
import { sendWhatsAppMessageSchema } from "@/lib/validators";
import { sendOutboundMessage } from "@/lib/whatsapp-messages";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]);
    const { id } = await params;
    await assertLeadAccessible(session, id);

    const body = await req.json();
    const data = sendWhatsAppMessageSchema.parse(body);

    const result = await sendOutboundMessage({
      leadId: id,
      sentByUserId: session.user.id,
      content: data.content,
      messageType: data.messageType,
      templateName: data.templateName,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
