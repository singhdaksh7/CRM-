import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getPropertyHealth } from "@/lib/rules";
import { getOrganizationId } from "@/lib/organization";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const result = await getPropertyHealth(id, getOrganizationId(session.user));
    if (!result) throw new ApiError(404, "Property not found");
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
