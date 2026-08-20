import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getReportsData } from "@/lib/reports-data";
import { getOrganizationId } from "@/lib/organization";

export async function GET() {
  try {
    const session = await requireSession(["ADMIN"]);
    const data = await getReportsData(getOrganizationId(session.user));
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
