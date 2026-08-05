import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { bulkAssignLeads, bulkUpdateLeadStatus, bulkScheduleFollowUp, bulkGenerateCatalogues } from "@/lib/bulk-operations";
import { z } from "zod";

const bulkSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ASSIGN"), ids: z.array(z.string()).min(1), assignedToId: z.string() }),
  z.object({ action: z.literal("STATUS"), ids: z.array(z.string()).min(1), status: z.string() }),
  z.object({ action: z.literal("FOLLOW_UP"), ids: z.array(z.string()).min(1), followUpType: z.string(), dueDate: z.string() }),
  z.object({ action: z.literal("CATALOGUE"), ids: z.array(z.string()).min(1) }),
]);

/** Every bulk mutation on leads (assign/status/follow-up/catalogue) is higher-blast-radius than a single-row edit, so all require ADMIN/DATA_MANAGER - same bar as the existing bulk-auto-assign route. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const organizationId = getOrganizationId(session.user.id);
    const body = bulkSchema.parse(await req.json());

    switch (body.action) {
      case "ASSIGN":
        return NextResponse.json(await bulkAssignLeads(body.ids, body.assignedToId, organizationId, session.user.id));
      case "STATUS":
        return NextResponse.json(await bulkUpdateLeadStatus(body.ids, body.status as never, organizationId, session.user.id));
      case "FOLLOW_UP": {
        const dueDate = new Date(body.dueDate);
        if (Number.isNaN(dueDate.getTime())) throw new ApiError(400, "Invalid dueDate");
        return NextResponse.json(await bulkScheduleFollowUp(body.ids, body.followUpType as never, dueDate, organizationId, session.user.id));
      }
      case "CATALOGUE":
        return NextResponse.json(await bulkGenerateCatalogues(body.ids, organizationId, session.user.id, session.user.role));
    }
  } catch (err) {
    return handleApiError(err);
  }
}
