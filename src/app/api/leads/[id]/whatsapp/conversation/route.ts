import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { assertLeadAccessible } from "@/lib/lead-access";
import { findOrCreateConversation } from "@/lib/whatsapp-conversations";
import { getOrganizationId } from "@/lib/organization";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]);
    const { id } = await params;
    await assertLeadAccessible(session, id);

    const conversation = await findOrCreateConversation(id, getOrganizationId(session.user));
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
