import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getReportsData } from "@/lib/reports-data";

export async function GET() {
  try {
    await requireSession(["ADMIN"]);
    const data = await getReportsData();
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
