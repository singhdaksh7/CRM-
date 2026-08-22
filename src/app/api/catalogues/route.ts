import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { fieldExecutiveLeadReadWhere } from "@/lib/lead-access";
import { prisma } from "@/lib/prisma";

const TAKE = 50;

/**
 * Org-scoped catalogue-share history. FE scoping reuses the shared
 * fieldExecutiveLeadReadWhere predicate (assigned OR unassigned) - same
 * policy as lead detail / assertLeadAccessible.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]);
    const organizationId = getOrganizationId(session.user);
    const leadWhere = session.user.role === "FIELD_EXECUTIVE" ? fieldExecutiveLeadReadWhere(session.user.id) : {};

    const shares = await prisma.catalogueShare.findMany({
      where: { organizationId, lead: leadWhere },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        lastViewedAt: true,
        viewCount: true,
        lead: { select: { id: true, clientName: true, phone: true } },
        _count: { select: { properties: true } },
      },
      orderBy: { createdAt: "desc" },
      take: TAKE,
    });

    return NextResponse.json({ shares });
  } catch (err) {
    return handleApiError(err);
  }
}
