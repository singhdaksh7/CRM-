import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const propertyFindFirst = vi.fn();
const propertyReportCreate = vi.fn();
const activityCreate = vi.fn();
const auditLogCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    property: { findFirst: (...a: unknown[]) => propertyFindFirst(...a) },
    propertyReport: { create: (...a: unknown[]) => propertyReportCreate(...a) },
    activity: { create: (...a: unknown[]) => activityCreate(...a) },
    auditLog: { create: (...a: unknown[]) => auditLogCreate(...a) },
  },
}));

let sessionUser: { id: string; role: string } = { id: "fe1", role: "FIELD_EXECUTIVE" };

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
    requireSession: async (allowedRoles?: string[]) => {
      if (allowedRoles && !allowedRoles.includes(sessionUser.role)) throw new MockApiError(403, "Forbidden");
      return { user: sessionUser };
    },
    handleApiError: (err: unknown) => {
      if (err instanceof MockApiError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err && typeof err === "object" && "issues" in err) return NextResponse.json({ error: "Validation failed" }, { status: 400 });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    },
  };
});

vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => auditLogCreate(...a) }));
vi.mock("@/lib/notifications", () => ({ notifyRoles: vi.fn() }));

const { POST } = await import("./route");

function req(body: unknown) {
  return new NextRequest(new Request("https://x.test/api/properties/p1/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}

function params() {
  return { params: Promise.resolve({ id: "p1" }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: "fe1", role: "FIELD_EXECUTIVE" };
  propertyFindFirst.mockResolvedValue({ id: "p1", title: "Spacious 2 BHK" });
  propertyReportCreate.mockResolvedValue({ id: "rep1" });
});

describe("POST /api/properties/[id]/report", () => {
  it("404s when the property doesn't exist", async () => {
    propertyFindFirst.mockResolvedValue(null);
    const res = await POST(req({ type: "WRONG_RENT" }), params());
    expect(res.status).toBe(404);
  });

  it("rejects an invalid report type with 400", async () => {
    const res = await POST(req({ type: "NOT_A_TYPE" }), params());
    expect(res.status).toBe(400);
  });

  it("creates the report and logs activity/audit", async () => {
    const res = await POST(req({ type: "WRONG_RENT", note: "Rent listed is outdated" }), params());
    expect(res.status).toBe(201);
    expect(propertyReportCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "WRONG_RENT" }) }));
    expect(activityCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "PROPERTY_REPORTED" }) }));
  });
});
