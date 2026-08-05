import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { runGlobalSearch } from "@/lib/search";
import { getOrganizationId } from "@/lib/organization";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const q = req.nextUrl.searchParams.get("q") ?? "";
    const organizationId = getOrganizationId(session.user.id);
    const response = await runGlobalSearch(q, { organizationId, role: session.user.role, userId: session.user.id });
    return NextResponse.json(response);
  } catch (err) {
    return handleApiError(err);
  }
}
