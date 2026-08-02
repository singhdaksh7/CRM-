import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getDashboardData } from "@/lib/dashboard-data";

export async function GET() {
  try {
    const session = await requireSession();
    const data = await getDashboardData(session.user.role, session.user.id);
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
