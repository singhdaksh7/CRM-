import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { assertLeadAccessible } from "@/lib/lead-access";
import { simulateReplySchema } from "@/lib/validators";
import { simulateReply } from "@/lib/whatsapp-messages";
import { getOrganizationId } from "@/lib/organization";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    await assertLeadAccessible(session, id);

    const { text } = simulateReplySchema.parse(await req.json());
    const message = await simulateReply(id, text, getOrganizationId(session.user));
    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
