import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const leadCount = vi.fn();
const leadCreate = vi.fn();
const leadFindFirst = vi.fn();
const leadFindUnique = vi.fn();
const leadFindMany = vi.fn();
const logActivity = vi.fn();
const recalculateLeadScore = vi.fn();
const runMatchingForLead = vi.fn();
const runAutomationRules = vi.fn();
const notifyRoles = vi.fn();
const autoAssignLead = vi.fn();

let sessionUser: { id: string; name?: string; role: string; organizationId?: string } = {
  id: "admin1",
  name: "Admin",
  role: "ADMIN",
  organizationId: "org_default",
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    lead: {
      count: (...a: unknown[]) => leadCount(...a),
      create: (...a: unknown[]) => leadCreate(...a),
      findFirst: (...a: unknown[]) => leadFindFirst(...a),
      findUnique: (...a: unknown[]) => leadFindUnique(...a),
      findMany: (...a: unknown[]) => leadFindMany(...a),
    },
    externalLeadEvent: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "evt-1", ...data })),
      update: vi.fn().mockResolvedValue({}),
    },
    customerContact: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

const { MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { MockApiError };
});

vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    ApiError: MockApiError,
    requireSession: async () => ({ user: sessionUser }),
    handleApiError: (err: unknown) => {
      if (err instanceof MockApiError) return NextResponse.json({ error: err.message }, { status: err.status });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    },
  };
});

vi.mock("@/lib/organization", () => ({
  getOrganizationId: (user?: { organizationId?: string }) => user?.organizationId ?? "org_default",
  getSystemOrganizationId: () => "org_default",
}));

vi.mock("@/lib/activity", () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));
vi.mock("@/lib/scoring", () => ({ recalculateLeadScore: (...a: unknown[]) => recalculateLeadScore(...a) }));
vi.mock("@/lib/lead-matching", () => ({ runMatchingForLead: (...a: unknown[]) => runMatchingForLead(...a) }));
vi.mock("@/lib/rules", () => ({ runAutomationRules: (...a: unknown[]) => runAutomationRules(...a) }));
vi.mock("@/lib/notifications", () => ({ notifyRoles: (...a: unknown[]) => notifyRoles(...a) }));
vi.mock("@/lib/assignment", () => ({ autoAssignLead: (...a: unknown[]) => autoAssignLead(...a) }));

const { POST } = await import("@/app/api/leads/route");
const { ingestWebhookLead } = await import("@/lib/lead-ingestion");
const { ingestPortalLead } = await import("@/integrations/property-portals/ingestion");

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: "admin1", name: "Admin", role: "ADMIN", organizationId: "org_default" };
  leadCount.mockResolvedValue(5);
  leadCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "lead-new-1", assignedToId: null, ...data }));
  leadFindUnique.mockImplementation(async ({ where }: { where: { id?: string; externalLeadId?: string } }) => {
    if (where.id) return { id: where.id, assignedTo: null, assignedToId: null };
    return null;
  });
  leadFindMany.mockResolvedValue([]);
  leadFindFirst.mockResolvedValue(null);
});

describe("Change 2 — Leads Default to Unassigned Requirements", () => {
  it("1. manual lead without assignee stays unassigned (assignedToId = null, no auto-assign)", async () => {
    const payload = {
      clientName: "Rahul Sharma",
      phone: "+919876543210",
      requirementType: "BUY",
      preferredLocation: "Dwarka",
      minBudget: 5000000,
      maxBudget: 10000000,
      source: "MANUAL",
      suitableForTags: [],
    };

    const req = new NextRequest(new Request("https://x.test/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }));

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(autoAssignLead).not.toHaveBeenCalled();
    const createData = leadCreate.mock.calls[0][0].data;
    expect(createData.assignedToId).toBeUndefined();
  });

  it("2. manual lead with explicit assignee assigns correctly", async () => {
    const payload = {
      clientName: "Pooja Verma",
      phone: "+919876543211",
      requirementType: "RENT",
      preferredLocation: "Rohini",
      minBudget: 25000,
      maxBudget: 40000,
      source: "MANUAL",
      assignedToId: "emp_42",
      suitableForTags: [],
    };

    const req = new NextRequest(new Request("https://x.test/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }));

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(autoAssignLead).not.toHaveBeenCalled();
    const createData = leadCreate.mock.calls[0][0].data;
    expect(createData.assignedToId).toBe("emp_42");
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ type: "LEAD_ASSIGNED" }));
  });

  it("3. portal lead stays unassigned", async () => {
    const canonical = {
      name: "Portal Client",
      phone: "+919876543212",
      locality: "Saket",
      transactionType: "RENT" as const,
      assetClass: "RESIDENTIAL" as const,
      minBudget: 20000,
      maxBudget: 35000,
    };
    const result = await ingestPortalLead("org_default", "HOUSING", canonical, { raw: 1 });
    expect(result.status).toBe("NEW");
    expect(autoAssignLead).not.toHaveBeenCalled();
    expect(leadCreate.mock.calls[0][0].data.assignedToId).toBeUndefined();
  });

  it("4. webhook lead stays unassigned", async () => {
    const input = {
      clientName: "Webhook Client",
      phone: "+919876543213",
      source: "99ACRES" as const,
      externalLeadId: "ext-1234",
      requirementType: "RENT" as const,
      location: "Janakpuri",
      minimumBudget: 20000,
      maximumBudget: 30000,
    };
    const res = await ingestWebhookLead(input, "ACRES_99");
    expect(autoAssignLead).not.toHaveBeenCalled();
    expect(res.assignment).toBeNull();
  });

  it("5. bulk import in src/lib/imports.ts preserves unassigned creation", async () => {
    const { runImport } = await import("@/lib/imports");
    expect(typeof runImport).toBe("function");
  });

  it("6. no individual assignment notification without assignee", async () => {
    const payload = {
      clientName: "Unassigned Client",
      phone: "+919876543214",
      requirementType: "RENT",
      preferredLocation: "Pitampura",
      minBudget: 20000,
      maxBudget: 30000,
      source: "MANUAL",
      suitableForTags: [],
    };

    const req = new NextRequest(new Request("https://x.test/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }));

    await POST(req);
    expect(notifyRoles).toHaveBeenCalledTimes(1);
    expect(notifyRoles).toHaveBeenCalledWith(["ADMIN", "DATA_MANAGER"], expect.objectContaining({ type: "NEW_LEAD" }));
  });

  it("7. organization scoping preserved during lead creation", async () => {
    sessionUser = { id: "admin2", name: "Admin 2", role: "ADMIN", organizationId: "org_branch_2" };
    const payload = {
      clientName: "Branch Client",
      phone: "+919876543215",
      requirementType: "RENT",
      preferredLocation: "Pitampura",
      minBudget: 20000,
      maxBudget: 30000,
      source: "MANUAL",
      suitableForTags: [],
    };

    const req = new NextRequest(new Request("https://x.test/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }));

    await POST(req);
    expect(leadCreate.mock.calls[0][0].data.organizationId).toBe("org_branch_2");
  });
});
