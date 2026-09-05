import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { recomputeMatchesForProperty } from "@/lib/demand-recommendations";
import { getSystemConfig } from "@/lib/system-config";
import { loadMatchHistory, matchHistoryStatusFor, matchHistorySortRank } from "@/lib/match-history";

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
    const status = sp.get("status");
    const config = await getSystemConfig(organizationId);
    const notContactedRecentlyOnly = sp.get("notContactedRecently") === "true";
    const cutoff = new Date(Date.now() - config.minimumDaysBetweenPropertyRecommendations * 24 * 60 * 60 * 1000);

    const recommendations = await prisma.propertyRecommendation.findMany({
      where: {
        organizationId,
        propertyId: id,
        ...(tier ? { tier: tier as never } : {}),
        ...(source ? { source: source as never } : {}),
        // Feature 1 (daily-ops hardening): a recompute (see
        // demand-recommendations.ts) marks a PENDING candidate EXPIRED once a
        // property edit makes it no longer match. Keep those out of the
        // default Matched Customers view (they were never acted on and are
        // no longer valid) without deleting the row - an explicit
        // ?status=EXPIRED request (or any other explicit status) still
        // surfaces it for history/debugging.
        ...(status ? { status: status as never } : { status: { not: "EXPIRED" } }),
      },
      include: {
        customerContact: { select: { id: true, name: true, phone: true, doNotContact: true, whatsAppOptOut: true, lastContactedAt: true, lastPropertySentAt: true } },
        lead: { select: { id: true, clientName: true, phone: true, status: true, lastContactedAt: true } },
        requirement: { select: { id: true, minBudget: true, maxBudget: true, preferredLocalities: true } },
      },
      orderBy: [{ tier: "asc" }, { score: "desc" }],
    });

    const contactRecencyFiltered = notContactedRecentlyOnly
      ? recommendations.filter((r) => {
          const lastContacted = r.customerContact?.lastContactedAt ?? r.lead?.lastContactedAt ?? null;
          return !lastContacted || lastContacted < cutoff;
        })
      : recommendations;

    // Feature 2 (daily-ops hardening): annotate each candidate with what the
    // CRM already knows happened between this lead and this exact property -
    // already shared, visited, or explicitly not-interested - reusing
    // CatalogueShareProperty/VisitProperty/CataloguePropertyPreference. Never
    // touches the underlying score/tier or deletes any history row.
    const leadIds = contactRecencyFiltered.map((r) => r.leadId).filter((id): id is string => Boolean(id));
    const history = await loadMatchHistory(organizationId, id, leadIds);
    const includeRejected = sp.get("includeRejected") === "true";
    const withHistory = contactRecencyFiltered
      .map((r) => ({ ...r, matchHistoryStatus: matchHistoryStatusFor(r.leadId, history) }))
      // REJECTED candidates are never presented as a normal fresh match by
      // default - never deleted, just excluded here unless explicitly asked
      // for (e.g. an audit/debug view), same convention as ?status=EXPIRED
      // above.
      .filter((r) => includeRejected || r.matchHistoryStatus !== "REJECTED");

    // RecommendationTier's meaningful order is its Postgres declaration order
    // (EXACT, STRONG, STRETCH, LOW) - NOT alphabetical - matching the
    // `orderBy: [{ tier: "asc" }, ...]` above; re-derive that same order here
    // now that a JS sort (needed for the history re-rank) replaces the
    // DB-level ordering for the final response.
    const TIER_RANK: Record<string, number> = { EXACT: 0, STRONG: 1, STRETCH: 2, LOW: 3 };
    const filtered = [...withHistory].sort((a, b) => {
      const tierDiff = TIER_RANK[a.tier] - TIER_RANK[b.tier];
      if (tierDiff !== 0) return tierDiff;
      const rankDiff = matchHistorySortRank(a.matchHistoryStatus) - matchHistorySortRank(b.matchHistoryStatus);
      if (rankDiff !== 0) return rankDiff;
      return b.score - a.score;
    });

    const summary = {
      total: filtered.length,
      exact: filtered.filter((r) => r.tier === "EXACT").length,
      strong: filtered.filter((r) => r.tier === "STRONG").length,
      stretch: filtered.filter((r) => r.tier === "STRETCH").length,
      low: filtered.filter((r) => r.tier === "LOW").length,
      new: filtered.filter((r) => r.matchHistoryStatus === "NEW" || r.matchHistoryStatus === "LIKED").length,
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
