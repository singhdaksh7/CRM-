import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getExecutiveDashboardData } from "@/lib/executive-dashboard-data";

/** Objective 4/5 - the executive's own daily view. ADMIN/DATA_MANAGER may pass ?employeeId= to view any executive's dashboard. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]);
    const employeeId = req.nextUrl.searchParams.get("employeeId");

    let targetUserId = session.user.id;
    if (employeeId && employeeId !== session.user.id) {
      if (session.user.role === "FIELD_EXECUTIVE") throw new ApiError(403, "Forbidden");
      targetUserId = employeeId;
    }

    const data = await getExecutiveDashboardData(targetUserId);
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
