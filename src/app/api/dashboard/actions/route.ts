import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getActionCenterItems } from "@/lib/rules";

export async function GET() {
  try {
    const session = await requireSession();
    const items = await getActionCenterItems(session.user.role, session.user.id);
    return NextResponse.json({ items });
  } catch (err) {
    return handleApiError(err);
  }
}
