import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { rollbackCreatedImportProperties } from "@/lib/inventory-import-service";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN"]); const { id } = await params;
    return NextResponse.json(await rollbackCreatedImportProperties(id, getOrganizationId(session.user), session.user.id));
  } catch (error) { return handleApiError(error); }
}
