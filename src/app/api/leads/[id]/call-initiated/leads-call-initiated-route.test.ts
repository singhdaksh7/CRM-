import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const leadFindFirst = vi.fn();
const activityCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { lead: { findFirst: (...a: unknown[]) => leadFindFirst(...a) }, activity: { create: (...a: unknown[]) => activityCreate(...a) } },
}));

vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));

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
    requireSession: async () => ({ user: { id: "fe1", role: "FIELD_EXECUTIVE" } }),
    handleApiError: (err: unknown) => {
      if (err instanceof MockApiError) return NextResponse.json({ error: err.message }, { status: err.status });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    },
  };
});

const { POST } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/leads/[id]/call-initiated", () => {
  it("404s when the lead doesn't exist", async () => {
    leadFindFirst.mockResolvedValue(null);
    const res = await POST(new NextRequest(new Request("https://x.test", { method: "POST" })), { params: Promise.resolve({ id: "lead1" }) });
    expect(res.status).toBe(404);
  });

  it("logs a CALL_INITIATED activity", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead1", assignedToId: "fe1" });
    const res = await POST(new NextRequest(new Request("https://x.test", { method: "POST" })), { params: Promise.resolve({ id: "lead1" }) });
    expect(res.status).toBe(200);
    expect(activityCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ leadId: "lead1", type: "CALL_INITIATED" }) }));
  });

  // Feature 6 (daily-ops hardening, RBAC consistency): a FIELD_EXECUTIVE must
  // not be able to log a call against a lead assigned to a different FE just
  // by knowing its ID - this route previously only org-scoped the lookup.
  it("rejects a FIELD_EXECUTIVE acting on a lead assigned to a different FE", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead1", assignedToId: "other-fe" });
    const res = await POST(new NextRequest(new Request("https://x.test", { method: "POST" })), { params: Promise.resolve({ id: "lead1" }) });
    expect(res.status).toBe(403);
    expect(activityCreate).not.toHaveBeenCalled();
  });

  it("allows a FIELD_EXECUTIVE to log a call on an unassigned lead", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead1", assignedToId: null });
    const res = await POST(new NextRequest(new Request("https://x.test", { method: "POST" })), { params: Promise.resolve({ id: "lead1" }) });
    expect(res.status).toBe(200);
  });
});
