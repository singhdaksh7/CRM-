import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { getLeadsNeedingAttention } from "@/lib/needs-attention";

// GET /api/leads/needs-attention - Feature 5 (daily-ops hardening): backs
// the "Needs Attention" surface on Today/My Work. Role scoping is handled
// entirely inside getLeadsNeedingAttention (org-wide for ADMIN/DATA_MANAGER,
// own-assigned-or-unassigned for FIELD_EXECUTIVE) - same convention as
// getTodaysWork.
export async function GET() {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user);
    const leads = await getLeadsNeedingAttention(organizationId, { id: session.user.id, role: session.user.role });
    return NextResponse.json({ leads });
  } catch (err) {
    return handleApiError(err);
  }
}
