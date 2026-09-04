import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Feature 2 (daily-ops hardening): GET /api/properties/[id]/matches now
// annotates each PropertyRecommendation with matchHistoryStatus and, by
// default, excludes REJECTED (NOT_INTERESTED) candidates from the normal
// Matched Customers view - without deleting the underlying history or the
// recommendation row itself (?includeRejected=true still returns it).
// ---------------------------------------------------------------------------

const propertyFindFirst = vi.fn();
const propertyRecommendationFindMany = vi.fn();
const catalogueSharePropertyFindMany = vi.fn();
const visitPropertyFindMany = vi.fn();
const cataloguePropertyPreferenceFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    property: { findFirst: (...a: unknown[]) => propertyFindFirst(...a) },
    propertyRecommendation: { findMany: (...a: unknown[]) => propertyRecommendationFindMany(...a) },
    catalogueShareProperty: { findMany: (...a: unknown[]) => catalogueSharePropertyFindMany(...a) },
    visitProperty: { findMany: (...a: unknown[]) => visitPropertyFindMany(...a) },
    cataloguePropertyPreference: { findMany: (...a: unknown[]) => cataloguePropertyPreferenceFindMany(...a) },
  },
}));

vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    ApiError: class ApiError extends Error {
      status: number;
      constructor(status: number, message: string) {
        super(message);
        this.status = status;
      }
    },
    requireSession: async () => ({ user: { id: "admin1", role: "ADMIN" } }),
    handleApiError: (err: { status?: number; message: string }) => NextResponse.json({ error: err.message }, { status: err.status ?? 500 }),
  };
});
vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_a" }));
vi.mock("@/lib/system-config", () => ({ getSystemConfig: async () => ({ minimumDaysBetweenPropertyRecommendations: 7 }) }));
vi.mock("@/lib/demand-recommendations", () => ({ recomputeMatchesForProperty: vi.fn() }));

const { GET } = await import("./route");

function req(qs = "") {
  return { req: new NextRequest(new Request(`https://x.test/api/properties/prop1/matches${qs}`)), params: Promise.resolve({ id: "prop1" }) };
}

function rec(leadId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `rec-${leadId}`,
    leadId,
    customerContactId: null,
    tier: "STRONG",
    score: 70,
    status: "PENDING",
    lead: { id: leadId, clientName: leadId, phone: "999", status: "NEW", lastContactedAt: null },
    customerContact: null,
    requirement: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  propertyFindFirst.mockResolvedValue({ id: "prop1", organizationId: "org_a" });
  catalogueSharePropertyFindMany.mockResolvedValue([]);
  visitPropertyFindMany.mockResolvedValue([]);
  cataloguePropertyPreferenceFindMany.mockResolvedValue([]);
});

describe("GET /api/properties/[id]/matches - match history annotation", () => {
  it("labels a candidate with no history as NEW and includes it", async () => {
    propertyRecommendationFindMany.mockResolvedValue([rec("lead1")]);
    const { req: r, params } = req();
    const res = await GET(r, { params });
    const body = await res.json();
    expect(body.recommendations).toHaveLength(1);
    expect(body.recommendations[0].matchHistoryStatus).toBe("NEW");
  });

  it("excludes a REJECTED (NOT_INTERESTED) candidate from the default response", async () => {
    propertyRecommendationFindMany.mockResolvedValue([rec("lead1"), rec("lead2")]);
    cataloguePropertyPreferenceFindMany.mockResolvedValue([{ leadId: "lead1", status: "NOT_INTERESTED" }]);
    const { req: r, params } = req();
    const res = await GET(r, { params });
    const body = await res.json();
    expect(body.recommendations.map((x: { leadId: string }) => x.leadId)).toEqual(["lead2"]);
    expect(body.summary.total).toBe(1);
  });

  it("still returns the REJECTED candidate (never deletes it) when explicitly asked via ?includeRejected=true", async () => {
    propertyRecommendationFindMany.mockResolvedValue([rec("lead1")]);
    cataloguePropertyPreferenceFindMany.mockResolvedValue([{ leadId: "lead1", status: "NOT_INTERESTED" }]);
    const { req: r, params } = req("?includeRejected=true");
    const res = await GET(r, { params });
    const body = await res.json();
    expect(body.recommendations).toHaveLength(1);
    expect(body.recommendations[0].matchHistoryStatus).toBe("REJECTED");
  });

  it("labels ALREADY_SHARED and VISITED candidates without excluding them", async () => {
    propertyRecommendationFindMany.mockResolvedValue([rec("lead1"), rec("lead2")]);
    catalogueSharePropertyFindMany.mockResolvedValue([{ catalogueShare: { leadId: "lead1" } }]);
    visitPropertyFindMany.mockResolvedValue([{ visit: { leadId: "lead2" } }]);
    const { req: r, params } = req();
    const res = await GET(r, { params });
    const body = await res.json();
    const byLead = Object.fromEntries(body.recommendations.map((x: { leadId: string; matchHistoryStatus: string }) => [x.leadId, x.matchHistoryStatus]));
    expect(byLead.lead1).toBe("ALREADY_SHARED");
    expect(byLead.lead2).toBe("VISITED");
    expect(body.recommendations).toHaveLength(2);
  });

  it("scopes the history lookup queries to this organization", async () => {
    propertyRecommendationFindMany.mockResolvedValue([rec("lead1")]);
    const { req: r, params } = req();
    await GET(r, { params });
    expect(catalogueSharePropertyFindMany.mock.calls[0][0].where.catalogueShare.organizationId).toBe("org_a");
    expect(visitPropertyFindMany.mock.calls[0][0].where.organizationId).toBe("org_a");
    expect(cataloguePropertyPreferenceFindMany.mock.calls[0][0].where.organizationId).toBe("org_a");
  });
});
