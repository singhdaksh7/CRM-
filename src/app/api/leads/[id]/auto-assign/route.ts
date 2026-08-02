import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { autoAssignLead } from "@/lib/assignment";
import { getOrganizationId } from "@/lib/organization";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    const outcome = await autoAssignLead(id, getOrganizationId(session.user.id));
    return NextResponse.json(outcome);
  } catch (err) {
    return handleApiError(err);
  }
}
