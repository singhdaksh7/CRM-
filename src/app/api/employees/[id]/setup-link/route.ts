import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { issueAccountSetupToken } from "@/lib/account-setup";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN"]);
    const { id } = await params;
    const result = await issueAccountSetupToken({
      userId: id,
      organizationId: getOrganizationId(session.user.id),
      actorId: session.user.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
