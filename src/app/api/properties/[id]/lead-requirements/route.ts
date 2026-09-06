import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { isLeadAccessibleToUser } from "@/lib/lead-access";
import { matchPropertyToRequirement } from "@/lib/lead-requirement-matching";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const organizationId = getOrganizationId(session.user);
    const property = await prisma.property.findFirst({ where: { id, organizationId } });
    if (!property) throw new ApiError(404, "Property not found");
    const requirements = await prisma.leadRequirement.findMany({
      where: { organizationId, status: "ACTIVE" },
      include: { lead: { select: { id: true, clientName: true, assignedToId: true, assignedTo: { select: { id: true, name: true } } } }, localities: { include: { locality: { select: { id: true, name: true } } } }, bhkValues: true },
      take: 1000,
    });
    const matches = requirements.flatMap((requirement) => {
      if (!isLeadAccessibleToUser(requirement.lead, session.user)) return [];
      const match = matchPropertyToRequirement(property, requirement);
      return match ? [{ ...match, lead: requirement.lead }] : [];
    }).sort((a, b) => b.score - a.score);
    return NextResponse.json({ matches });
  } catch (error) { return handleApiError(error); }
}
