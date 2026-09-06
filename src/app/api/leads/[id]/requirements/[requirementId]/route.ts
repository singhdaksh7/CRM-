import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { assertLeadAccessible } from "@/lib/lead-access";
import { logActivity } from "@/lib/activity";
import { leadRequirementSchema } from "../route";

const include = { localities: { include: { locality: { select: { id: true, name: true } } } }, bhkValues: { orderBy: { bhk: "asc" as const } } };

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; requirementId: string }> }) {
  try {
    const session = await requireSession();
    const { id, requirementId } = await params;
    const lead = await assertLeadAccessible(session, id);
    const organizationId = getOrganizationId(session.user);
    const existing = await prisma.leadRequirement.findFirst({ where: { id: requirementId, leadId: lead.id, organizationId } });
    if (!existing) throw new ApiError(404, "Requirement not found");
    const body = await req.json();
    const statusOnly = Object.keys(body).length === 1 && typeof body.status === "string";
    if (statusOnly && !["ACTIVE", "PAUSED", "FULFILLED", "CANCELLED"].includes(body.status)) throw new ApiError(400, "Invalid requirement status");
    if (statusOnly) {
      const requirement = await prisma.leadRequirement.update({ where: { id: existing.id }, data: { status: body.status }, include });
      await logActivity({ leadId: lead.id, organizationId, actorId: session.user.id, type: "LEAD_UPDATED", description: `Property requirement ${requirement.status.toLowerCase()}`, metadata: { requirementId: requirement.id, status: requirement.status } });
      return NextResponse.json({ requirement });
    }
    const data = leadRequirementSchema.parse(body);
    const { localityIds, bhks, ...requirementData } = data;
    const uniqueLocalityIds = [...new Set(localityIds)];
    if (uniqueLocalityIds.length) {
      const count = await prisma.propertyLocality.count({ where: { organizationId, id: { in: uniqueLocalityIds } } });
      if (count !== uniqueLocalityIds.length) throw new ApiError(400, "Every selected locality must belong to this organization");
    }
    const requirement = await prisma.leadRequirement.update({
      where: { id: existing.id },
      data: { ...requirementData, propertyType: requirementData.propertyType as never, localities: { deleteMany: {}, create: uniqueLocalityIds.map((localityId) => ({ localityId })) }, bhkValues: { deleteMany: {}, create: [...new Set(bhks)].map((bhk) => ({ bhk })) } },
      include,
    });
    await logActivity({ leadId: lead.id, organizationId, actorId: session.user.id, type: "LEAD_UPDATED", description: `Property requirement ${requirement.status.toLowerCase()}`, metadata: { requirementId: requirement.id, status: requirement.status } });
    return NextResponse.json({ requirement });
  } catch (error) { return handleApiError(error); }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; requirementId: string }> }) {
  try {
    const session = await requireSession();
    const { id, requirementId } = await params;
    const lead = await assertLeadAccessible(session, id);
    const organizationId = getOrganizationId(session.user);
    const existing = await prisma.leadRequirement.findFirst({ where: { id: requirementId, leadId: lead.id, organizationId } });
    if (!existing) throw new ApiError(404, "Requirement not found");
    await prisma.leadRequirement.delete({ where: { id: existing.id } });
    await logActivity({ leadId: lead.id, organizationId, actorId: session.user.id, type: "LEAD_UPDATED", description: "Property requirement deleted", metadata: { requirementId } });
    return NextResponse.json({ ok: true });
  } catch (error) { return handleApiError(error); }
}
