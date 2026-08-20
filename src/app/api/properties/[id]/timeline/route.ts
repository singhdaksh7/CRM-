import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getPropertyTimeline } from "@/lib/property-timeline";
import { getOrganizationId } from "@/lib/organization";

/** Objective 8 - append-only complete property history, oldest first. No PATCH/DELETE exists for this table by design - nothing is ever overwritten. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const events = await getPropertyTimeline(id, getOrganizationId(session.user));
    return NextResponse.json({ events });
  } catch (err) {
    return handleApiError(err);
  }
}
