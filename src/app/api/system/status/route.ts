import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getSystemStatus } from "@/lib/system-status";

export async function GET() {
  try {
    await requireSession(["ADMIN"]);
    const status = await getSystemStatus();
    return NextResponse.json(status);
  } catch (err) {
    return handleApiError(err);
  }
}
