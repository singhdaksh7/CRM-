import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { disableEmployeeAccount, enableEmployeeAccount } from "@/lib/account-lifecycle";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { invalidateCache } from "@/lib/cache";

/**
 * ADMIN-only enable/disable. Deliberately a separate route from the generic
 * employee PATCH: disabling has to revoke sessions and destroy outstanding
 * credential links, which is not something a generic field update should do
 * as a side effect.
 */
const bodySchema = z.object({ action: z.enum(["DISABLE", "ENABLE"]) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN"]);
    const limit = await checkRateLimit("accountAdminAction", session.user.id);
    if (!limit.allowed) return rateLimitResponse(limit);

    const { id } = await params;
    const organizationId = getOrganizationId(session.user.id);
    const { action } = bodySchema.parse(await req.json());

    const result =
      action === "DISABLE"
        ? await disableEmployeeAccount({ employeeId: id, organizationId, actorId: session.user.id })
        : await enableEmployeeAccount({ employeeId: id, organizationId, actorId: session.user.id });

    await invalidateCache(`employees:list:${organizationId}`);
    return NextResponse.json({ employee: result });
  } catch (error) {
    return handleApiError(error);
  }
}
