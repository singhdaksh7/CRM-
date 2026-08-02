import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { recalculateLeadScore } from "@/lib/scoring";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
    const { id } = await params;
    const result = await recalculateLeadScore(id, "MANUAL_RECALCULATE");
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
