import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const leadCount = vi.fn();
const leadCreate = vi.fn();
const leadFindFirst = vi.fn();
const leadFindUnique = vi.fn();
const leadFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    lead: {
      count: (...a: unknown[]) => leadCount(...a),
      create: (...a: unknown[]) => leadCreate(...a),
      findFirst: (...a: unknown[]) => leadFindFirst(...a),
      findUnique: (...a: unknown[]) => leadFindUnique(...a),
      findMany: (...a: unknown[]) => leadFindMany(...a),
    },
  },
}));

let sessionUser: { id: string; role: string } = { id: "admin1", role: "ADMIN" };

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

vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));
vi.mock("@/lib/activity", () => ({ logActivity: vi.fn() }));
const autoAssignLead = vi.fn();
vi.mock("@/lib/assignment", () => ({ autoAssignLead: (...a: unknown[]) => autoAssignLead(...a) }));
const recalculateLeadScore = vi.fn();
vi.mock("@/lib/scoring", () => ({ recalculateLeadScore: (...a: unknown[]) => recalculateLeadScore(...a) }));
const runMatchingForLead = vi.fn();
vi.mock("@/lib/lead-matching", () => ({ runMatchingForLead: (...a: unknown[]) => runMatchingForLead(...a) }));
vi.mock("@/lib/notifications", () => ({ notifyRoles: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

// Minimal stand-in mirroring the real digit-shape rules in
// src/integrations/whatsapp/phone.ts, just enough for these tests.
vi.mock("@/integrations/whatsapp", () => ({
  normalizeIndianPhone: (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
    return null;
  },
}));

const { POST, GET } = await import("./route");

function jsonRequest(body: unknown) {
  return new NextRequest(
    new Request("https://x.test/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  );
}

function getRequest(query = "") {
  return new NextRequest(new Request(`https://x.test/api/leads${query}`));
}

const VALID_BODY = {
  clientName: "Rahul Sharma",
  phone: "9876543210",
  source: "MANUAL",
  requirementType: "RENT",
  preferredLocation: "Janakpuri",
  minBudget: 15000,
  maxBudget: 25000,
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: "admin1", role: "ADMIN" };
  leadCount.mockResolvedValue(0);
  leadFindFirst.mockResolvedValue(null);
  autoAssignLead.mockResolvedValue(null);
  recalculateLeadScore.mockResolvedValue({ score: 50, priority: "WARM", factors: [] });
  runMatchingForLead.mockResolvedValue({ matchCount: 0 });
  leadCreate.mockResolvedValue({ id: "lead1", clientName: "Rahul Sharma", preferredLocation: "Janakpuri", assignedToId: "emp1" });
  leadFindUnique.mockResolvedValue({ id: "lead1", clientName: "Rahul Sharma" });
  leadFindMany.mockResolvedValue([]);
});

describe("GET /api/leads - bounded pagination", () => {
  it("passes a bounded default take when the client sends none, instead of an unbounded findMany", async () => {
    await GET(getRequest());

    expect(leadFindMany).toHaveBeenCalledTimes(1);
    const args = leadFindMany.mock.calls[0][0];
    expect(typeof args.take).toBe("number");
    expect(args.take).toBeGreaterThan(0);
    expect(args.take).toBeLessThanOrEqual(200); // MAX_PAGE_SIZE in src/lib/pagination.ts
    expect(args.skip).toBe(0);
  });

  it("honors a client-supplied take (e.g. EntityPicker's as-you-type take=10), clamped to the max page size", async () => {
    await GET(getRequest("?take=10"));

    const args = leadFindMany.mock.calls[0][0];
    expect(args.take).toBe(10);
  });

  it("clamps an oversized take request instead of returning the entire table", async () => {
    await GET(getRequest("?take=999999"));

    const args = leadFindMany.mock.calls[0][0];
    expect(args.take).toBeLessThanOrEqual(200);
  });

  it("never includes passwordHash in the assignedTo projection", async () => {
    await GET(getRequest());

    const args = leadFindMany.mock.calls[0][0];
    expect(args.include.assignedTo.select).toEqual({ id: true, name: true });
    expect(args.include.assignedTo.select.passwordHash).toBeUndefined();
  });
});

describe("POST /api/leads - duplicate-lead soft warning", () => {
  it("creates the lead and returns duplicateWarning: null when no existing lead shares the phone number", async () => {
    const res = await POST(jsonRequest(VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.duplicateWarning).toBeNull();
    expect(leadCreate).toHaveBeenCalled();
  });

  it("still creates the lead but flags duplicateWarning when an existing lead in the org shares the phone number", async () => {
    leadFindFirst.mockResolvedValue({ id: "existing-lead", clientName: "Existing Client" });

    const res = await POST(jsonRequest(VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(leadCreate).toHaveBeenCalled(); // not blocked
    expect(body.duplicateWarning).toEqual({ leadId: "existing-lead", clientName: "Existing Client" });
  });

  it("runs matching after creation and doesn't fail the request if matching throws", async () => {
    runMatchingForLead.mockRejectedValue(new Error("matching blew up"));

    const res = await POST(jsonRequest(VALID_BODY));

    expect(res.status).toBe(201);
    expect(runMatchingForLead).toHaveBeenCalledWith("lead1", "created");
  });
});
