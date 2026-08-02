import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { matchPropertiesToLead } from "@/lib/matching";
import { getOrganizationId } from "@/lib/organization";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const organizationId = getOrganizationId(session.user.id);
    const lead = await prisma.lead.findFirst({ where: { id, organizationId } });
    if (!lead) throw new ApiError(404, "Lead not found");
    if (session.user.role === "FIELD_EXECUTIVE" && lead.assignedToId !== session.user.id) {
      throw new ApiError(403, "Forbidden");
    }

    const tolerance = Number(req.nextUrl.searchParams.get("tolerance") ?? "0.2");
    const properties = await prisma.property.findMany({ where: { status: "AVAILABLE", organizationId } });
    const matches = matchPropertiesToLead(properties, lead, tolerance);

    return NextResponse.json({ matches });
  } catch (err) {
    return handleApiError(err);
  }
}
