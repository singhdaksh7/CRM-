import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

/**
 * Change 13 - Lead Timeline should include "Call Made". A tel: link can't
 * confirm the call actually connected (hence CALL_INITIATED, not
 * CALL_MADE), but this is the honest signal available from a browser.
 * Fire-and-forget from the client - never blocks the phone dialer opening.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id: leadId } = await params;
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true } });
    if (!lead) throw new ApiError(404, "Lead not found");

    await logActivity({ leadId, type: "CALL_INITIATED", description: "Call initiated from the field", actorId: session.user.id });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
