import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { reopenDeal, updateDealClosure } from "@/lib/deal-closure";
import { z } from "zod";

const updateClosureSchema = z.object({
  action: z.enum(["update", "reopen"]).default("update"),
  closedByUserId: z.string().optional(),
  propertyId: z.string().nullable().optional(),
  closedAt: z.string().optional(),
  notes: z.string().optional(),
  newStatus: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const organizationId = getOrganizationId(session.user);
    const { id: dealId } = await params;

    const body = await req.json().catch(() => ({}));
    const parsed = updateClosureSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    if (parsed.data.action === "reopen") {
      const deal = await reopenDeal({
        organizationId,
        dealId,
        actorId: session.user.id,
        newStatus: parsed.data.newStatus,
      });
      return NextResponse.json({ success: true, deal });
    }

    const deal = await updateDealClosure({
      organizationId,
      dealId,
      actorId: session.user.id,
      closedByUserId: parsed.data.closedByUserId,
      propertyId: parsed.data.propertyId,
      closedAt: parsed.data.closedAt,
      notes: parsed.data.notes,
    });

    return NextResponse.json({ success: true, deal });
  } catch (err) {
    return handleApiError(err);
  }
}
