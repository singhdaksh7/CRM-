import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { markLeadDealClosed } from "@/lib/deal-closure";
import { z } from "zod";

const closeDealSchema = z.object({
  propertyId: z.string().nullable().optional(),
  closedByUserId: z.string().min(1, "Deal closed by employee is required"),
  closedAt: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const organizationId = getOrganizationId(session.user);
    const { id: leadId } = await params;

    const body = await req.json().catch(() => ({}));
    const parsed = closeDealSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const deal = await markLeadDealClosed({
      organizationId,
      leadId,
      propertyId: parsed.data.propertyId,
      closedByUserId: parsed.data.closedByUserId,
      markedByUserId: session.user.id,
      closedAt: parsed.data.closedAt,
      notes: parsed.data.notes,
    });

    return NextResponse.json({ success: true, deal });
  } catch (err) {
    return handleApiError(err);
  }
}
