import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { visitPropertyOutcomeSchema } from "@/lib/validators";
import { recordVisitPropertyOutcome } from "@/lib/visits";

/**
 * Per-property workflow inside one visit: [Mark as Visited], the 1-5 star
 * client-reaction form, the optional note, and [Skip] with an optional
 * reason. One endpoint because they are all the same write - "what happened
 * with this property, and how did the client react".
 *
 * UNAVAILABLE is accepted here too, but only mirrors the outcome onto the
 * visit-property row: the actual "report property unavailable" decision
 * still goes through the existing Phase 4 POST
 * /api/properties/[id]/availability-report flow (photo evidence required).
 * The client calls that first, then this.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; propertyId: string }> }) {
  try {
    const session = await requireSession();
    const { id, propertyId } = await params;
    const input = visitPropertyOutcomeSchema.parse(await req.json());

    const visitProperty = await recordVisitPropertyOutcome(id, propertyId, getOrganizationId(session.user.id), session.user, input);
    return NextResponse.json({ visitProperty });
  } catch (err) {
    return handleApiError(err);
  }
}
