import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { assertLeadAccessible } from "@/lib/lead-access";
import { getVisitPropertyCandidates } from "@/lib/visit-property-candidates";

/**
 * Backend support for Schedule Visit property selection groups.
 * Does not schedule visits or redesign visit UI.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user);
    const { id: leadId } = await params;
    await assertLeadAccessible({ user: session.user }, leadId);
    const result = await getVisitPropertyCandidates(leadId, organizationId);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
