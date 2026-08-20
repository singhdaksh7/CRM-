import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { getPropertyIssues } from "@/lib/property-issues";

/**
 * Change 9 - unified Property Issues Queue. Merges open
 * PropertyAvailabilityReport and PropertyReport rows into one list, each
 * tagged with issueType, so admins see everything (already rented, wrong
 * rent, owner unreachable, duplicate listing, ...) in one place. The
 * underlying models stay separate - their resolve semantics genuinely
 * differ - only this read is unified.
 */
export async function GET() {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const organizationId = getOrganizationId(session.user);
    const issues = await getPropertyIssues(organizationId);
    return NextResponse.json({ issues, total: issues.length });
  } catch (err) {
    return handleApiError(err);
  }
}
