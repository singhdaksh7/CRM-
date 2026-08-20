import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { assignedToSelect } from "@/lib/user-select";
import { getOrganizationId } from "@/lib/organization";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user);
    const leadId = req.nextUrl.searchParams.get("leadId");
    const activities = await prisma.activity.findMany({
      where: leadId ? { organizationId, leadId } : { organizationId },
      include: { actor: { select: assignedToSelect }, lead: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ activities });
  } catch (err) {
    return handleApiError(err);
  }
}
