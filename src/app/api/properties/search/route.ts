import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import type { Prisma } from "@prisma/client";

const RESULT_CAP = 20;

/**
 * Lightweight, org-scoped property search for the "Add More Properties"
 * picker in the matching workspace - deliberately minimal (no filters
 * beyond a free-text query plus optional rent/BHK bounds) and capped at
 * RESULT_CAP results so it stays fast enough for debounced as-you-type
 * search. Not a replacement for the full /api/properties list endpoint.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user);
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim();

    const where: Prisma.PropertyWhereInput = { organizationId };
    if (q) {
      where.OR = [
        { propertyCode: { contains: q } },
        { title: { contains: q } },
        { area: { contains: q } },
        { address: { contains: q } },
      ];
    }

    const minRent = sp.get("minRent");
    const maxRent = sp.get("maxRent");
    if (minRent || maxRent) {
      where.monthlyRent = {
        ...(minRent ? { gte: Number(minRent) } : {}),
        ...(maxRent ? { lte: Number(maxRent) } : {}),
      };
    }

    const bhk = sp.get("bhk");
    if (bhk) where.bhk = Number(bhk);

    const properties = await prisma.property.findMany({
      where,
      select: {
        id: true,
        propertyCode: true,
        title: true,
        area: true,
        listingType: true,
        monthlyRent: true,
        salePrice: true,
        bhk: true,
        furnishing: true,
        coverImage: true,
        status: true,
      },
      orderBy: { createdAt: "desc" },
      take: RESULT_CAP,
    });

    return NextResponse.json({ properties });
  } catch (err) {
    return handleApiError(err);
  }
}
