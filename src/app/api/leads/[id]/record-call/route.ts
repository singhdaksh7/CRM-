import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { assertLeadAccessible } from "@/lib/lead-access";
import { recordCallSchema } from "@/lib/validators";
import { recordCall } from "@/lib/record-call";
import { getOrganizationId } from "@/lib/organization";

/**
 * simplified-data-manager-workflow - orchestrates the "Record Call" popup.
 * Reuses assertLeadAccessible for the exact same read-access/org-isolation
 * rule every other lead-child route already enforces, then the same
 * write-level "a field executive must own the assignment" check the
 * follow-ups route uses, before handing off to the transactional service.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id: leadId } = await params;
    const organizationId = getOrganizationId(session.user);
    const body = recordCallSchema.parse(await req.json());

    const lead = await assertLeadAccessible(session, leadId);
    if (session.user.role === "FIELD_EXECUTIVE" && lead.assignedToId !== session.user.id) {
      throw new ApiError(403, "Forbidden - this lead is not assigned to you");
    }

    const result = await recordCall({
      leadId,
      organizationId,
      actorId: session.user.id,
      spokeWithCustomer: body.spokeWithCustomer,
      outcome: body.outcome,
      callbackDate: body.callbackDate,
      callbackTime: body.callbackTime,
      note: body.note,
      lostReasonCategory: body.lostReasonCategory,
      lostReasonDetail: body.lostReasonDetail,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
