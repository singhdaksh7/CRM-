import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { assertLeadAccessible } from "@/lib/lead-access";
import { getConversationForLead, listMessages } from "@/lib/whatsapp-conversations";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    await assertLeadAccessible(session, id);

    const conversation = await getConversationForLead(id);
    if (!conversation) return NextResponse.json({ conversation: null, messages: [] });

    const messages = await listMessages(conversation.id);
    return NextResponse.json({ conversation, messages });
  } catch (err) {
    return handleApiError(err);
  }
}
