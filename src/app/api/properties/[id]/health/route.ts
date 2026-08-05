import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getPropertyHealth } from "@/lib/rules";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
    const { id } = await params;
    const result = await getPropertyHealth(id);
    if (!result) throw new ApiError(404, "Property not found");
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
