import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { recordAudit } from "@/lib/audit";
import { resolveListingConflict } from "@/integrations/property-portals/operations";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { resolution } = await request.json() as { resolution?: "KEEP_CRM" | "ACCEPT_PORTAL" | "REVIEW" };
    if (!resolution || !["KEEP_CRM", "ACCEPT_PORTAL", "REVIEW"].includes(resolution)) return NextResponse.json({ error: "A valid explicit resolution is required" }, { status: 400 });
    const listing = await resolveListingConflict(getOrganizationId(session.user), (await params).id, resolution, session.user.id);
    await recordAudit({ userId: session.user.id, action: "UPDATE", entityType: "PortalListing", entityId: listing.id, newValues: { event: "PORTAL_SYNC_CONFLICT_RESOLVED", resolution } });
    return NextResponse.json({ listing });
  } catch (error) { return handleApiError(error); }
}
