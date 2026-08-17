import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { rescheduleVisitSchema } from "@/lib/validators";
import { rescheduleVisit } from "@/lib/visits";

/** Admin / Data Manager reschedule: new date, new time, and/or a new executive. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    const input = rescheduleVisitSchema.parse(await req.json());

    let visitDate: Date | undefined;
    if (input.visitDate) {
      visitDate = new Date(input.visitDate);
      if (Number.isNaN(visitDate.getTime())) throw new ApiError(400, "Invalid visit date");
    }

    const visit = await rescheduleVisit(id, getOrganizationId(session.user.id), session.user, {
      visitDate,
      visitTime: input.visitTime,
      assignedToId: input.assignedToId,
    });
    return NextResponse.json({ visit });
  } catch (err) {
    return handleApiError(err);
  }
}
