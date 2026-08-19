import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { customerRequirementSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";
import { recordAudit } from "@/lib/audit";

// POST /api/customers/[id]/requirements - add a new requirement to an
// existing contact (rule 3: one contact may hold multiple active
// requirements at once).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const organizationId = getOrganizationId(session.user.id);
    const { id } = await params;
    const contact = await prisma.customerContact.findFirst({ where: { id, organizationId } });
    if (!contact) throw new ApiError(404, "Contact not found");

    const body = customerRequirementSchema.parse(await req.json());
    const requirement = await prisma.customerRequirement.create({
      data: {
        organizationId,
        customerContactId: id,
        assetClass: body.assetClass,
        transactionType: body.transactionType,
        propertyType: body.propertyType ?? null,
        commercialPropertyType: body.commercialPropertyType ?? null,
        preferredLocalities: JSON.stringify(body.preferredLocalities),
        minBudget: body.minBudget ?? null,
        maxBudget: body.maxBudget ?? null,
        minArea: body.minArea ?? null,
        maxArea: body.maxArea ?? null,
        bhk: body.assetClass === "COMMERCIAL" ? null : body.bhk ?? null,
        floorPreference: body.floorPreference ?? null,
        furnishing: body.furnishing ?? null,
        parkingRequired: body.parkingRequired ?? null,
        liftRequired: body.liftRequired ?? null,
        commercialFitOutPref: body.commercialFitOutPref ?? null,
        workstations: body.workstations ?? null,
        cabins: body.cabins ?? null,
        possession: body.possession ?? null,
        notes: body.notes ?? null,
        active: body.active,
        priority: body.priority,
        createdById: session.user.id,
      },
    });
    await recordAudit({ userId: session.user.id, action: "CREATE", entityType: "CustomerRequirement", entityId: requirement.id, newValues: { customerContactId: id, assetClass: requirement.assetClass, transactionType: requirement.transactionType } });
    return NextResponse.json({ requirement }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
