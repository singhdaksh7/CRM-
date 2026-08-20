import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { getFieldOpsSummary } from "@/lib/field-ops-summary-data";

/** Objective 12 - Manager Dashboard widgets. ADMIN/DATA_MANAGER only. */
export async function GET() {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const organizationId = getOrganizationId(session.user);
    const summary = await getFieldOpsSummary(organizationId);
    return NextResponse.json({ summary });
  } catch (err) {
    return handleApiError(err);
  }
}
