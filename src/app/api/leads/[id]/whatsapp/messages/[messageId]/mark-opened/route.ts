import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { assertLeadAccessible } from "@/lib/lead-access";
import { markClickToChatOpened } from "@/lib/whatsapp-messages";

/**
 * Not in the original endpoint list, but required by the click-to-chat
 * status policy described in the spec: "once the link is opened by the
 * user, mark it SENT only as an application-side action." The UI calls this
 * immediately after `window.open(clickToChatUrl)`.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]);
    const { id, messageId } = await params;
    await assertLeadAccessible(session, id);

    const message = await markClickToChatOpened(messageId);
    return NextResponse.json({ message });
  } catch (err) {
    return handleApiError(err);
  }
}
