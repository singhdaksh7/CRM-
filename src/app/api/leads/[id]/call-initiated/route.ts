import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity";
import { assertLeadAccessible } from "@/lib/lead-access";

/**
 * Change 13 - Lead Timeline should include "Call Made". A tel: link can't
 * confirm the call actually connected (hence CALL_INITIATED, not
 * CALL_MADE), but this is the honest signal available from a browser.
 * Fire-and-forget from the client - never blocks the phone dialer opening.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id: leadId } = await params;
    // Feature 6 (daily-ops hardening, RBAC consistency): previously only
    // org-scoped, so a FIELD_EXECUTIVE could log a call against another FE's
    // lead by ID. Reuses the same ownership helper every sibling lead-child
    // route (notes/interactions/match) already goes through.
    await assertLeadAccessible(session, leadId);

    // simplified-role-workflow (spec item 6) - optional, best-effort: which
    // number (primary or alternate) the call was placed to, when the caller
    // sends one. Never required - the pre-existing no-body POST keeps working.
    const body = await req.json().catch(() => ({}) as { phone?: unknown });
    const phone = typeof body.phone === "string" && body.phone.trim() ? body.phone.trim() : null;

    await logActivity({ leadId, type: "CALL_INITIATED", description: phone ? `Call initiated to ${phone}` : "Call initiated from the field", actorId: session.user.id });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
