import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { prisma } from "@/lib/prisma";

const TAKE = 50;

/**
 * Org-scoped catalogue-share history, promoted to its own "Catalogues" nav
 * destination (simplified-role-workflow, spec item 9/12) instead of being
 * reachable only from inside a single lead's workspace. Role scoping mirrors
 * every other list route in the app: ADMIN/DATA_MANAGER see the whole
 * organization, FIELD_EXECUTIVE only sees shares on leads assigned to them
 * (same rule as /api/leads and /api/executive/today).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]);
    const organizationId = getOrganizationId(session.user);
    const leadWhere = session.user.role === "FIELD_EXECUTIVE" ? { assignedToId: session.user.id } : {};

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
