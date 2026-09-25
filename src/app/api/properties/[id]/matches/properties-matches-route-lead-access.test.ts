import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Lead access isolation (task requirement: "preserve lead access rules"):
// GET /api/properties/[id]/matches surfaces PropertyRecommendation rows that
// can be backed by a Lead assigned to a specific FIELD_EXECUTIVE. Every
// other Lead-touching route in this app enforces isLeadAccessibleToUser
// (see lead-access.ts) so a FIELD_EXECUTIVE never sees a lead assigned to a
// different employee; this route must do the same for LEAD-sourced
// recommendations instead of exposing every organization-wide match.
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

const requireSession = vi.fn();
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
    requireSession: (...a: unknown[]) => requireSession(...a),
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

function rec(leadId: string, assignedToId: string | null) {
  return {
    id: `rec-${leadId}`,
    leadId,
    customerContactId: null,
    tier: "STRONG",
    score: 70,
    status: "PENDING",
    lead: { id: leadId, clientName: leadId, phone: "999", status: "NEW", lastContactedAt: null, assignedToId },
    customerContact: null,
    requirement: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  propertyFindFirst.mockResolvedValue({ id: "prop1", organizationId: "org_a" });
  catalogueSharePropertyFindMany.mockResolvedValue([]);
  visitPropertyFindMany.mockResolvedValue([]);
  cataloguePropertyPreferenceFindMany.mockResolvedValue([]);
});

describe("GET /api/properties/[id]/matches - lead access isolation", () => {
  it("a FIELD_EXECUTIVE only sees leads assigned to them or unassigned", async () => {
    requireSession.mockResolvedValue({ user: { id: "fe1", role: "FIELD_EXECUTIVE" } });
    propertyRecommendationFindMany.mockResolvedValue([
      rec("lead-mine", "fe1"),
      rec("lead-unassigned", null),
      rec("lead-other-executive", "fe2"),
    ]);

    const { req: r, params } = req();
    const res = await GET(r, { params });
    const body = await res.json();

    expect(body.recommendations.map((x: { leadId: string }) => x.leadId).sort()).toEqual(["lead-mine", "lead-unassigned"]);
  });

  it("an ADMIN sees every lead in the organization regardless of assignment", async () => {
    requireSession.mockResolvedValue({ user: { id: "admin1", role: "ADMIN" } });
    propertyRecommendationFindMany.mockResolvedValue([rec("lead-a", "fe1"), rec("lead-b", "fe2")]);

    const { req: r, params } = req();
    const res = await GET(r, { params });
    const body = await res.json();

    expect(body.recommendations).toHaveLength(2);
  });
});
