import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { recomputeMatchesForRequirement } from "@/lib/demand-recommendations";

// GET /api/customers/requirements/[id]/matches - matching properties for
// this requirement (rule 11 direction A).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user);
    const { id } = await params;
    const requirement = await prisma.customerRequirement.findFirst({ where: { id, organizationId } });
    if (!requirement) throw new ApiError(404, "Requirement not found");

    const sp = req.nextUrl.searchParams;
    const tier = sp.get("tier");
    const recommendations = await prisma.propertyRecommendation.findMany({
      where: { organizationId, requirementId: id, ...(tier ? { tier: tier as never } : {}) },
      include: { property: { select: { id: true, title: true, area: true, propertyCode: true, coverImage: true, listingType: true, monthlyRent: true, salePrice: true } } },
      orderBy: [{ tier: "asc" }, { score: "desc" }],
    });
    return NextResponse.json({ recommendations });
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/customers/requirements/[id]/matches - [Find Matching
// Properties] explicit manual rematch (rule 43).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const organizationId = getOrganizationId(session.user);
    const { id } = await params;
    const requirement = await prisma.customerRequirement.findFirst({ where: { id, organizationId } });
    if (!requirement) throw new ApiError(404, "Requirement not found");
    const result = await recomputeMatchesForRequirement(id, organizationId);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
