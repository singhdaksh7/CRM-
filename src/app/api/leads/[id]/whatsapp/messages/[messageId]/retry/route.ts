import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { assertLeadAccessible } from "@/lib/lead-access";
import { retryMessage } from "@/lib/whatsapp-messages";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]);
    const { id, messageId } = await params;
    await assertLeadAccessible(session, id);

    const limitResult = await checkRateLimit("whatsappRetry", session.user.id);
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const result = await retryMessage(messageId, session.user.id);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
