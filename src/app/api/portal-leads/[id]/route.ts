import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { recordAudit } from "@/lib/audit";

const actionSchema = z.object({ action: z.enum(["LINK_EXISTING", "REJECT", "RETRY"]), leadId: z.string().optional() });
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await context.params;
    const organizationId = getOrganizationId(session.user);
    const input = actionSchema.parse(await request.json());
    const event = await prisma.externalLeadEvent.findFirst({ where: { id, organizationId } });
    if (!event) return NextResponse.json({ error: "Portal lead event not found" }, { status: 404 });
    if (input.action === "LINK_EXISTING") {
      if (!input.leadId) return NextResponse.json({ error: "leadId is required" }, { status: 400 });
      const lead = await prisma.lead.findFirst({ where: { id: input.leadId, organizationId } });
      if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      const updated = await prisma.externalLeadEvent.update({ where: { id }, data: { leadId: lead.id, ingestionStatus: "MATCHED_EXISTING", resolvedAt: new Date(), resolvedById: session.user.id } });
      await recordAudit({ userId: session.user.id, action: "UPDATE", entityType: "ExternalLeadEvent", entityId: id, newValues: { event: "PORTAL_LEAD_LINKED", leadId: lead.id } });
      return NextResponse.json({ event: updated });
    }
    const updated = await prisma.externalLeadEvent.update({ where: { id }, data: input.action === "REJECT" ? { ingestionStatus: "REJECTED", resolvedAt: new Date(), resolvedById: session.user.id } : { ingestionStatus: "NEEDS_REVIEW", attemptCount: { increment: 1 }, lastAttemptAt: new Date(), failureReason: null } });
    await recordAudit({ userId: session.user.id, action: "UPDATE", entityType: "ExternalLeadEvent", entityId: id, newValues: { event: input.action === "REJECT" ? "PORTAL_LEAD_REJECTED" : "PORTAL_LEAD_RETRY_REQUESTED" } });
    return NextResponse.json({ event: updated });
  } catch (error) { return handleApiError(error); }
}
