import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getLeadHealth } from "@/lib/rules";
import { getOrganizationId } from "@/lib/organization";
import { assertLeadAccessible } from "@/lib/lead-access";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    // Feature 6 (daily-ops hardening, RBAC consistency): this route
    // previously only org-scoped the lookup, so a FIELD_EXECUTIVE could read
    // health for a lead assigned to a different FE just by knowing its ID -
    // inconsistent with the sibling notes/interactions/match routes, which
    // already gate through assertLeadAccessible. Reuses the same helper,
    // no new authorization logic.
    await assertLeadAccessible(session, id);
    const result = await getLeadHealth(id, getOrganizationId(session.user));
    if (!result) throw new ApiError(404, "Lead not found");
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
