import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { assertLeadAccessible } from "@/lib/lead-access";
import { simulateStatusSchema } from "@/lib/validators";
import { simulateStatus } from "@/lib/whatsapp-messages";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    await assertLeadAccessible(session, id);

    const { messageId, status } = simulateStatusSchema.parse(await req.json());
    const message = await simulateStatus(messageId, status);
    return NextResponse.json({ message });
  } catch (err) {
    return handleApiError(err);
  }
}
