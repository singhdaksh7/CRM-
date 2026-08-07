import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { dealStageUpdateSchema } from "@/lib/validators";
import { transitionDealStage } from "@/lib/deals";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]);
    const { id } = await params;
    const body = await req.json();
    const data = dealStageUpdateSchema.parse(body);

    const deal = await transitionDealStage({
      dealId: id,
      stage: data.stage,
      notes: data.notes,
      lostReason: data.lostReason,
      lostReasonCategory: data.lostReasonCategory,
      agreedAmount: data.agreedAmount,
      closingDate: data.closingDate,
      closingNotes: data.closingNotes,
      expectedBrokerageAmount: data.expectedBrokerageAmount,
      kpSharePct: data.kpSharePct,
      partnerSharePct: data.partnerSharePct,
      actorId: session.user.id,
      actorRole: session.user.role,
    });

    return NextResponse.json({ deal });
  } catch (err) {
    return handleApiError(err);
  }
}
