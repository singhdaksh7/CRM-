import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { recomputeMatchesForProperty } from "@/lib/demand-recommendations";
import { getSystemConfig } from "@/lib/system-config";

// GET /api/properties/[id]/matches - MATCHED CUSTOMERS panel (rule 19):
// unified CONTACT + LEAD candidates for this property, filterable by tier/
// source/locality/budget/contact-recency/WhatsApp-eligibility.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user);
    const { id } = await params;
    const property = await prisma.property.findFirst({ where: { id, organizationId } });
    if (!property) throw new ApiError(404, "Property not found");

    const sp = req.nextUrl.searchParams;
    const tier = sp.get("tier");
    const source = sp.get("source");
    const config = await getSystemConfig(organizationId);
    const notContactedRecentlyOnly = sp.get("notContactedRecently") === "true";
    const cutoff = new Date(Date.now() - config.minimumDaysBetweenPropertyRecommendations * 24 * 60 * 60 * 1000);

    const recommendations = await prisma.propertyRecommendation.findMany({
      where: {
        organizationId,
        propertyId: id,
        ...(tier ? { tier: tier as never } : {}),
        ...(source ? { source: source as never } : {}),
      },
      include: {
        customerContact: { select: { id: true, name: true, phone: true, doNotContact: true, whatsAppOptOut: true, lastContactedAt: true, lastPropertySentAt: true } },
        lead: { select: { id: true, clientName: true, phone: true, status: true, lastContactedAt: true } },
        requirement: { select: { id: true, minBudget: true, maxBudget: true, preferredLocalities: true } },
      },
      orderBy: [{ tier: "asc" }, { score: "desc" }],
    });

    const filtered = notContactedRecentlyOnly
      ? recommendations.filter((r) => {
          const lastContacted = r.customerContact?.lastContactedAt ?? r.lead?.lastContactedAt ?? null;
          return !lastContacted || lastContacted < cutoff;
        })
      : recommendations;

    const summary = {
      total: filtered.length,
      exact: filtered.filter((r) => r.tier === "EXACT").length,
      strong: filtered.filter((r) => r.tier === "STRONG").length,
      stretch: filtered.filter((r) => r.tier === "STRETCH").length,
      low: filtered.filter((r) => r.tier === "LOW").length,
    };
    return NextResponse.json({ recommendations: filtered, summary });
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/properties/[id]/matches - [Recalculate Matches] explicit manual
// rematch (rule 43); also the entry point a create/update handler enqueues
// after a property is created or materially changed (rule 12/41).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const organizationId = getOrganizationId(session.user);
    const { id } = await params;
    const property = await prisma.property.findFirst({ where: { id, organizationId } });
    if (!property) throw new ApiError(404, "Property not found");
    const result = await recomputeMatchesForProperty(id, organizationId);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
