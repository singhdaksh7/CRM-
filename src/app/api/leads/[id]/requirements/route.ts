import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { assertLeadAccessible } from "@/lib/lead-access";
import { logActivity } from "@/lib/activity";

export const leadRequirementSchema = z.object({
  transactionType: z.enum(["RENT", "SALE"]),
  assetClass: z.enum(["RESIDENTIAL", "COMMERCIAL"]).default("RESIDENTIAL"),
  propertyType: z.string().nullable().optional(),
  minBudget: z.number().int().nonnegative().nullable().optional(),
  maxBudget: z.number().int().positive().nullable().optional(),
  minAreaSqft: z.number().int().positive().nullable().optional(),
  maxAreaSqft: z.number().int().positive().nullable().optional(),
  floorPreference: z.string().trim().max(200).nullable().optional(),
  liftPreference: z.enum(["REQUIRED", "PREFERRED", "NO_PREFERENCE"]).default("NO_PREFERENCE"),
  parkingPreference: z.enum(["REQUIRED", "PREFERRED", "NO_PREFERENCE"]).default("NO_PREFERENCE"),
  furnishingPreference: z.enum(["FURNISHED", "SEMI_FURNISHED", "UNFURNISHED"]).nullable().optional(),
  possessionPreference: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  status: z.enum(["ACTIVE", "PAUSED", "FULFILLED", "CANCELLED"]).default("ACTIVE"),
  localityIds: z.array(z.string().min(1)).max(30).default([]),
  bhks: z.array(z.number().int().min(0).max(10)).max(11).default([]),
}).superRefine((data, context) => {
  if (data.minBudget != null && data.maxBudget != null && data.minBudget > data.maxBudget) context.addIssue({ code: "custom", path: ["maxBudget"], message: "Maximum budget must be at least the minimum" });
  if (data.minAreaSqft != null && data.maxAreaSqft != null && data.minAreaSqft > data.maxAreaSqft) context.addIssue({ code: "custom", path: ["maxAreaSqft"], message: "Maximum area must be at least the minimum" });
});

const include = { localities: { include: { locality: { select: { id: true, name: true } } } }, bhkValues: { orderBy: { bhk: "asc" as const } } };

async function assertLocalitiesOwned(organizationId: string, localityIds: string[]) {
  const ids = [...new Set(localityIds)];
  if (!ids.length) return ids;
  const count = await prisma.propertyLocality.count({ where: { organizationId, id: { in: ids } } });
  if (count !== ids.length) throw new ApiError(400, "Every selected locality must belong to this organization");
  return ids;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const lead = await assertLeadAccessible(session, id);
    const requirements = await prisma.leadRequirement.findMany({ where: { organizationId: getOrganizationId(session.user), leadId: lead.id }, include, orderBy: { createdAt: "asc" } });
    return NextResponse.json({ requirements });
  } catch (error) { return handleApiError(error); }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const lead = await assertLeadAccessible(session, id);
    const organizationId = getOrganizationId(session.user);
    const data = leadRequirementSchema.parse(await req.json());
    const { localityIds, bhks, ...requirementData } = data;
    const ownedLocalityIds = await assertLocalitiesOwned(organizationId, localityIds);
    const requirement = await prisma.leadRequirement.create({
      data: {
        ...requirementData,
        propertyType: requirementData.propertyType as never,
        organizationId,
        leadId: lead.id,
        createdById: session.user.id,
        localities: { create: ownedLocalityIds.map((localityId) => ({ localityId })) },
        bhkValues: { create: [...new Set(bhks)].map((bhk) => ({ bhk })) },
      },
      include,
    });
    await logActivity({ leadId: lead.id, organizationId, actorId: session.user.id, type: "LEAD_UPDATED", description: "Property requirement created", metadata: { requirementId: requirement.id, status: requirement.status } });
    return NextResponse.json({ requirement }, { status: 201 });
  } catch (error) { return handleApiError(error); }
}
