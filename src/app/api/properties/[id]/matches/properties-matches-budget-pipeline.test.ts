import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { filterByBudgetRange, formatBudgetLabel, NO_BUDGET_FILTER } from "@/components/customers/budget-range-logic";
import { resolveRecommendationBudget } from "@/lib/match-budget";

// Integration coverage for the real bug: LEAD-sourced recommendations have
// requirementId = null, the matcher scores them against Lead.minBudget/maxBudget,
// but the matches API only returned `requirement` (null) - so the UI saw no
// budget ("Budget -") and the budget filter hid every lead. These tests run the
// REAL route handler and feed its actual JSON into the UI filter/label code.

const propertyFindFirst = vi.fn();
const propertyRecommendationFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    property: { findFirst: (...a: unknown[]) => propertyFindFirst(...a) },
    propertyRecommendation: { findMany: (...a: unknown[]) => propertyRecommendationFindMany(...a) },
    catalogueShareProperty: { findMany: async () => [] },
    visitProperty: { findMany: async () => [] },
    cataloguePropertyPreference: { findMany: async () => [] },
  },
}));
vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    ApiError: class ApiError extends Error {},
    requireSession: async () => ({ user: { id: "admin", role: "ADMIN" } }),
    handleApiError: (err: { message: string }) => NextResponse.json({ error: err.message }, { status: 500 }),
  };
});
vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_a" }));
vi.mock("@/lib/system-config", () => ({ getSystemConfig: async () => ({ minimumDaysBetweenPropertyRecommendations: 7 }) }));
vi.mock("@/lib/demand-recommendations", () => ({ recomputeMatchesForProperty: vi.fn() }));

const { GET } = await import("./route");

const CR = 10000000;
const L = 100000;

// Shape Prisma returns for LEAD-sourced rows: no requirement, budget on the lead.
function leadRec(name: string, maxBudget: number | null, minBudget = 0) {
  return {
    id: `rec-${name}`,
    leadId: `lead-${name}`,
    customerContactId: null,
    requirementId: null,
    source: "LEAD",
    tier: "STRONG",
    score: 75,
    status: "PENDING",
    reasons: JSON.stringify([{ label: "Budget", matched: true, detail: `Within budget (max ₹${maxBudget})` }]),
    lead: { id: `lead-${name}`, clientName: name, phone: "9", status: "NEW", lastContactedAt: null, assignedToId: null, minBudget, maxBudget },
    customerContact: null,
    requirement: null,
  };
}

async function fetchRows() {
  const res = await GET(new NextRequest(new Request("https://x.test/api/properties/p1/matches")), { params: Promise.resolve({ id: "p1" }) });
  return (await res.json()) as { recommendations: Array<ReturnType<typeof leadRec> & { budget: { minBudget: number | null; maxBudget: number | null } | null }> };
}

beforeEach(() => {
  vi.clearAllMocks();
  propertyFindFirst.mockResolvedValue({ id: "p1", organizationId: "org_a" });
  propertyRecommendationFindMany.mockResolvedValue([
    leadRec("SARTHAK", 2.25 * CR),
    leadRec("Ashnoor", 2.5 * CR),
    leadRec("Arti", 4 * CR),
    leadRec("Jasbir", 2.5 * CR),
  ]);
});

describe("matches API → UI budget pipeline (real route, real transformation)", () => {
  it("1. API selects the lead's budget fields and returns numeric budget on every row", async () => {
    const { recommendations } = await fetchRows();
    const select = propertyRecommendationFindMany.mock.calls[0][0].include.lead.select;
    expect(select.minBudget).toBe(true);
    expect(select.maxBudget).toBe(true);
    const sarthak = recommendations.find((r) => r.id === "rec-SARTHAK")!;
    expect(sarthak.budget).toEqual({ minBudget: null, maxBudget: 2.25 * CR });
    // numeric, not parsed from the reason text
    expect(typeof sarthak.budget!.maxBudget).toBe("number");
  });

  it("2. score, tier and ordering are untouched by the response mapping", async () => {
    const { recommendations } = await fetchRows();
    expect(recommendations.map((r) => [r.score, r.tier])).toEqual([[75, "STRONG"], [75, "STRONG"], [75, "STRONG"], [75, "STRONG"]]);
    expect(recommendations.map((r) => r.id)).toEqual(["rec-SARTHAK", "rec-Ashnoor", "rec-Arti", "rec-Jasbir"]);
  });

  it("3. ₹48L–₹2.79Cr shows SARTHAK/Ashnoor/Jasbir and hides Arti (3 of 4)", async () => {
    const { recommendations } = await fetchRows();
    const visible = filterByBudgetRange(recommendations, { min: 48 * L, max: 2.79 * CR });
    expect(visible.map((r) => r.lead.clientName)).toEqual(["SARTHAK", "Ashnoor", "Jasbir"]);
    expect(`Showing ${visible.length} of ${recommendations.length} matched leads`).toBe("Showing 3 of 4 matched leads");
  });

  it("4. ₹2.25 Cr and ₹2.50 Cr pass; ₹4 Cr fails", async () => {
    const { recommendations } = await fetchRows();
    const ids = (min: number, max: number) => filterByBudgetRange(recommendations, { min, max }).map((r) => r.lead.clientName);
    expect(ids(0, 2.25 * CR)).toEqual(["SARTHAK"]);
    expect(ids(0, 2.5 * CR)).toEqual(["SARTHAK", "Ashnoor", "Jasbir"]);
    expect(ids(0, 2.79 * CR)).not.toContain("Arti");
  });

  it("5. cards show the structured budget, never 'Budget -'; 'not specified' only when truly absent", async () => {
    propertyRecommendationFindMany.mockResolvedValue([
      leadRec("OnlyMax", 2.25 * CR),
      leadRec("MinMax", 2.25 * CR, 1.5 * CR),
      leadRec("None", null),
    ]);
    const { recommendations } = await fetchRows();
    const fmt = (n: number) => `₹${n / CR} Cr`;
    const labels = recommendations.map((r) => formatBudgetLabel(r.budget, fmt));
    expect(labels).toEqual(["Budget up to ₹2.25 Cr", "Budget ₹1.5 Cr – ₹2.25 Cr", "Budget not specified"]);
    expect(labels.join()).not.toContain("Budget -");
  });

  it("6. leads genuinely missing a budget are hidden only while a filter is active", async () => {
    propertyRecommendationFindMany.mockResolvedValue([leadRec("None", null), leadRec("Has", 2 * CR)]);
    const { recommendations } = await fetchRows();
    expect(filterByBudgetRange(recommendations, NO_BUDGET_FILTER)).toHaveLength(2);
    expect(filterByBudgetRange(recommendations, { min: null, max: 3 * CR }).map((r) => r.lead.clientName)).toEqual(["Has"]);
  });

  it("7. contact-sourced rows keep using their requirement budget", () => {
    expect(resolveRecommendationBudget({ requirement: { minBudget: 1 * CR, maxBudget: 2 * CR }, lead: null })).toEqual({ minBudget: 1 * CR, maxBudget: 2 * CR });
    expect(resolveRecommendationBudget({ requirement: null, lead: null })).toBeNull();
  });

  it("8. panel is wired to the API budget field and keeps explicit Apply/Remove", () => {
    const src = readFileSync("src/components/customers/matched-customers-panel.tsx", "utf8");
    expect(src).toContain("matchesBudgetRange(r.budget, budgetRange)");
    expect(src).toContain("formatBudgetLabel(row.budget");
    expect(src).not.toContain("row.requirement?.maxBudget");
    expect(src).toContain("onApply={setBudgetRange}");
    expect(src).toContain("onRemove=");
  });

  it("9. demand-matching.ts (scoring) is not modified by this fix", () => {
    const src = readFileSync("src/lib/demand-matching.ts", "utf8");
    expect(src).toContain("Within budget (max ₹");
  });
});
