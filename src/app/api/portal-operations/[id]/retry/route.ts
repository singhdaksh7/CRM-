import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { recordAudit } from "@/lib/audit";
import { retryPortalOperation } from "@/integrations/property-portals/operations";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const operation = await retryPortalOperation(getOrganizationId(session.user.id), (await params).id);
    await recordAudit({ userId: session.user.id, action: "UPDATE", entityType: "PortalOperation", entityId: operation.id, newValues: { event: "PORTAL_OPERATION_MANUAL_RETRY", attempt: operation.attemptCount, state: operation.status } });
    return NextResponse.json({ operation });
  } catch (error) { return handleApiError(error); }
}
