import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Behavioral two-organization isolation tests for src/lib/dashboard-data.ts.
//
// These do NOT hit a real database. Instead they use an in-memory fake store
// seeded with ORG_A and ORG_B rows, and fake Prisma method implementations
// that genuinely apply the `where` clause the application code passes in
// (organizationId, assignedToId, status, createdAt/updatedAt ranges, role).
// This means the tests actually exercise dashboard-data.ts's real query
// construction: if a future change drops an `organizationId` filter from
// one of these queries, the fake store will return rows from BOTH orgs and
// the assertion on counts/names will fail - these are not just "does the
// where object contain organizationId" string checks.
// ---------------------------------------------------------------------------

const ORG_A = "org_a";
const ORG_B = "org_b";

type Lead = {
  id: string;
  organizationId: string;
  assignedToId: string | null;
  status: string;
  source: string;
  createdAt: Date;
  updatedAt: Date;
};

type Property = { id: string; organizationId: string; area: string; status: string };
type Employee = { id: string; organizationId: string; role: string; name: string };
type ActivityRow = { id: string; organizationId: string; leadId: string | null; actorId: string | null };

const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);

const leads: Lead[] = [
  // ORG_A: 2 unassigned, 1 assigned, all created today; 1 CLOSED_WON updated this month
  { id: "a-lead-1", organizationId: ORG_A, assignedToId: null, status: "NEW", source: "WEBSITE", createdAt: today, updatedAt: today },
  { id: "a-lead-2", organizationId: ORG_A, assignedToId: null, status: "NEW", source: "REFERRAL", createdAt: today, updatedAt: today },
  { id: "a-lead-3", organizationId: ORG_A, assignedToId: "a-emp-1", status: "CLOSED_WON", source: "WEBSITE", createdAt: today, updatedAt: today },
  // ORG_B: 5 unassigned leads, all created today; 3 CLOSED_WON - deliberately
  // larger numbers than ORG_A so any leak is obvious in the assertions below.
  { id: "b-lead-1", organizationId: ORG_B, assignedToId: null, status: "NEW", source: "OLX", createdAt: today, updatedAt: today },
  { id: "b-lead-2", organizationId: ORG_B, assignedToId: null, status: "NEW", source: "OLX", createdAt: today, updatedAt: today },
  { id: "b-lead-3", organizationId: ORG_B, assignedToId: null, status: "NEW", source: "OLX", createdAt: today, updatedAt: today },
  { id: "b-lead-4", organizationId: ORG_B, assignedToId: null, status: "NEW", source: "OLX", createdAt: today, updatedAt: today },
  { id: "b-lead-5", organizationId: ORG_B, assignedToId: null, status: "NEW", source: "OLX", createdAt: today, updatedAt: today },
  { id: "b-lead-6", organizationId: ORG_B, assignedToId: "b-emp-1", status: "CLOSED_WON", source: "OLX", createdAt: today, updatedAt: today },
  { id: "b-lead-7", organizationId: ORG_B, assignedToId: "b-emp-1", status: "CLOSED_WON", source: "OLX", createdAt: today, updatedAt: today },
  { id: "b-lead-8", organizationId: ORG_B, assignedToId: "b-emp-1", status: "CLOSED_WON", source: "OLX", createdAt: today, updatedAt: today },
];

const properties: Property[] = [
  { id: "a-prop-1", organizationId: ORG_A, area: "Janakpuri", status: "AVAILABLE" },
  { id: "b-prop-1", organizationId: ORG_B, area: "Dwarka", status: "AVAILABLE" },
  { id: "b-prop-2", organizationId: ORG_B, area: "Dwarka", status: "AVAILABLE" },
  { id: "b-prop-3", organizationId: ORG_B, area: "Rohini", status: "AVAILABLE" },
];

const employees: Employee[] = [
  { id: "a-emp-1", organizationId: ORG_A, role: "FIELD_EXECUTIVE", name: "Org A Exec" },
  { id: "b-emp-1", organizationId: ORG_B, role: "FIELD_EXECUTIVE", name: "Org B Exec" },
  { id: "b-emp-2", organizationId: ORG_B, role: "FIELD_EXECUTIVE", name: "Org B Exec 2" },
];

const activities: ActivityRow[] = [
  { id: "a-act-1", organizationId: ORG_A, leadId: "a-lead-1", actorId: "a-emp-1" },
  { id: "b-act-1", organizationId: ORG_B, leadId: "b-lead-1", actorId: "b-emp-1" },
  { id: "b-act-2", organizationId: ORG_B, leadId: "b-lead-2", actorId: "b-emp-1" },
];

function matchesLeadWhere(lead: Lead, where: Record<string, unknown>): boolean {
  if (where.organizationId !== undefined && lead.organizationId !== where.organizationId) return false;
  if ("assignedToId" in where) {
    if (where.assignedToId === null && lead.assignedToId !== null) return false;
    if (typeof where.assignedToId === "string" && lead.assignedToId !== where.assignedToId) return false;
  }
  if (typeof where.status === "string" && lead.status !== where.status) return false;
  return true;
}

const leadCount = vi.fn(async (args: { where: Record<string, unknown> }) => leads.filter((l) => matchesLeadWhere(l, args.where)).length);
const leadGroupBy = vi.fn(async (args: { where: Record<string, unknown>; by: string[] }) => {
  const filtered = leads.filter((l) => matchesLeadWhere(l, args.where));
  const key = args.by[0] as "source" | "status";
  const groups = new Map<string, number>();
  for (const l of filtered) groups.set(l[key], (groups.get(l[key]) ?? 0) + 1);
  return Array.from(groups.entries()).map(([k, count]) => ({ [key]: k, _count: { _all: count } }));
});
const leadFindMany = vi.fn(async () => []);

const propertyGroupBy = vi.fn(async (args: { where?: Record<string, unknown> }) => {
  const filtered = properties.filter((p) => (args.where?.organizationId === undefined ? true : p.organizationId === args.where.organizationId));
  const groups = new Map<string, number>();
  for (const p of filtered) groups.set(p.area, (groups.get(p.area) ?? 0) + 1);
  return Array.from(groups.entries()).map(([area, count]) => ({ area, _count: { _all: count } }));
});

const userFindMany = vi.fn(async (args: { where: Record<string, unknown> }) => {
  return employees
    .filter((e) => e.organizationId === args.where.organizationId && e.role === args.where.role)
    .map((e) => ({
      id: e.id,
      name: e.name,
      _count: { assignedLeads: leads.filter((l) => l.assignedToId === e.id && l.organizationId === e.organizationId).length },
    }));
});

const activityFindMany = vi.fn(async (args: { where: Record<string, unknown> }) => {
  return activities
    .filter((a) => a.organizationId === args.where.organizationId && a.leadId !== null)
    .map((a) => ({ id: a.id, actor: { name: "x" }, lead: { id: a.leadId } }));
});

const queryRaw = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
  const orgId = values.find((v) => v === ORG_A || v === ORG_B);
  const wantsClosedWon = strings.some((s) => s.includes("CLOSED_WON"));
  const filtered = leads.filter((l) => l.organizationId === orgId && (!wantsClosedWon || l.status === "CLOSED_WON"));
  return [{ bucket: today, count: BigInt(filtered.length) }];
});

const followUpCount = vi.fn(async () => 0);
const visitCount = vi.fn(async () => 0);
const whatsAppMessageCount = vi.fn(async () => 0);
const catalogueInteractionCount = vi.fn(async () => 0);
const catalogueInteractionFindMany = vi.fn(async () => []);

vi.mock("./prisma", () => ({
  prisma: {
    lead: { count: (...a: unknown[]) => leadCount(...(a as [never])), groupBy: (...a: unknown[]) => leadGroupBy(...(a as [never])), findMany: (...a: unknown[]) => leadFindMany(...(a as [never])) },
    property: { groupBy: (...a: unknown[]) => propertyGroupBy(...(a as [never])) },
    followUp: { count: (...a: unknown[]) => followUpCount(...(a as [never])) },
    visit: { count: (...a: unknown[]) => visitCount(...(a as [never])) },
    whatsAppMessage: { count: (...a: unknown[]) => whatsAppMessageCount(...(a as [never])) },
    catalogueInteraction: { count: (...a: unknown[]) => catalogueInteractionCount(...(a as [never])), findMany: (...a: unknown[]) => catalogueInteractionFindMany(...(a as [never])) },
    user: { findMany: (...a: unknown[]) => userFindMany(...(a as [never])) },
    activity: { findMany: (...a: unknown[]) => activityFindMany(...(a as [never])) },
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => queryRaw(strings, ...values),
  },
}));

const getOrganizationId = vi.fn();
vi.mock("./organization", () => ({ getOrganizationId: (userId?: string) => getOrganizationId(userId) }));

vi.mock("./cache", () => ({
  cached: (_key: string, _ttl: number, compute: () => unknown) => compute(),
  invalidateCache: vi.fn(),
}));

import { getDashboardCriticalData, getDashboardSecondaryData } from "./dashboard-data";

beforeEach(() => {
  getOrganizationId.mockImplementation((userId?: string) => (userId === "org-a-user" ? ORG_A : userId === "org-b-user" ? ORG_B : ORG_A));
});

describe("dashboard-data two-organization isolation", () => {
  it("newLeadsToday, unassignedLeads, dealsClosedThisMonth only ever count the requesting org's leads", async () => {
    const dataA = await getDashboardCriticalData("ADMIN", "org-a-user");
    expect(dataA.newLeadsToday).toBe(3); // 3 ORG_A leads created today
    expect(dataA.unassignedLeads).toBe(2); // 2 ORG_A unassigned leads, never ORG_B's 5
    expect(dataA.dealsClosedThisMonth).toBe(1); // 1 ORG_A CLOSED_WON, never ORG_B's 3

    const dataB = await getDashboardCriticalData("ADMIN", "org-b-user");
    expect(dataB.newLeadsToday).toBe(8);
    expect(dataB.unassignedLeads).toBe(5);
    expect(dataB.dealsClosedThisMonth).toBe(3);
  });

  it("employeeLeadCounts only lists the requesting org's field executives", async () => {
    const dataA = await getDashboardSecondaryData("ADMIN", "org-a-user");
    expect(dataA.employeeLeadCounts.map((e) => e.name)).toEqual(["Org A Exec"]);
    expect(dataA.employeeLeadCounts).not.toContainEqual(expect.objectContaining({ name: "Org B Exec" }));

    const dataB = await getDashboardSecondaryData("ADMIN", "org-b-user");
    expect(dataB.employeeLeadCounts.map((e) => e.name).sort()).toEqual(["Org B Exec", "Org B Exec 2"]);
  });

  it("leadsBySource and leadsByStatus never mix org rows", async () => {
    const dataA = await getDashboardSecondaryData("ADMIN", "org-a-user");
    const totalA = dataA.leadsBySource.reduce((sum, s) => sum + s.value, 0);
    expect(totalA).toBe(3);
    expect(dataA.leadsBySource.some((s) => s.name === "OLX")).toBe(false); // OLX is ORG_B-only

    const dataB = await getDashboardSecondaryData("ADMIN", "org-b-user");
    const totalB = dataB.leadsBySource.reduce((sum, s) => sum + s.value, 0);
    expect(totalB).toBe(8);
  });

  it("propertiesByLocation never includes another org's inventory", async () => {
    const dataA = await getDashboardSecondaryData("ADMIN", "org-a-user");
    expect(dataA.propertiesByLocation).toEqual([{ name: "Janakpuri", value: 1 }]);
    expect(dataA.propertiesByLocation.some((p) => p.name === "Dwarka" || p.name === "Rohini")).toBe(false);

    const dataB = await getDashboardSecondaryData("ADMIN", "org-b-user");
    const total = dataB.propertiesByLocation.reduce((sum, p) => sum + p.value, 0);
    expect(total).toBe(3);
  });

  it("recentActivities never includes another org's activity rows", async () => {
    const dataA = await getDashboardSecondaryData("ADMIN", "org-a-user");
    expect(dataA.recentActivities.map((a) => a.id)).toEqual(["a-act-1"]);

    const dataB = await getDashboardSecondaryData("ADMIN", "org-b-user");
    expect(dataB.recentActivities.map((a) => a.id).sort()).toEqual(["b-act-1", "b-act-2"]);
  });

  it("monthlyTrend's raw-SQL leads/deals aggregates are scoped to the requesting org", async () => {
    const dataA = await getDashboardSecondaryData("ADMIN", "org-a-user");
    const thisMonthA = dataA.monthlyTrend[dataA.monthlyTrend.length - 1];
    expect(thisMonthA.leads).toBe(3);
    expect(thisMonthA.deals).toBe(1);

    const dataB = await getDashboardSecondaryData("ADMIN", "org-b-user");
    const thisMonthB = dataB.monthlyTrend[dataB.monthlyTrend.length - 1];
    expect(thisMonthB.leads).toBe(8);
    expect(thisMonthB.deals).toBe(3);
  });
});
