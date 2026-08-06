import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getPropertyTimeline } from "@/lib/property-timeline";

/** Objective 8 - append-only complete property history, oldest first. No PATCH/DELETE exists for this table by design - nothing is ever overwritten. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
    const { id } = await params;
    const events = await getPropertyTimeline(id);
    return NextResponse.json({ events });
  } catch (err) {
    return handleApiError(err);
  }
}
