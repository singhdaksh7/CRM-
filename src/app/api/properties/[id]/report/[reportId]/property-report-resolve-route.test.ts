import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const propertyReportFindFirst = vi.fn();
const propertyReportUpdate = vi.fn();
const activityCreate = vi.fn();
const auditLogCreate = vi.fn();
const notificationCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    propertyReport: { findFirst: (...a: unknown[]) => propertyReportFindFirst(...a), update: (...a: unknown[]) => propertyReportUpdate(...a) },
    activity: { create: (...a: unknown[]) => activityCreate(...a) },
    auditLog: { create: (...a: unknown[]) => auditLogCreate(...a) },
    notification: { create: (...a: unknown[]) => notificationCreate(...a) },
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
    requireSession: async (allowedRoles?: string[]) => {
      if (allowedRoles && !allowedRoles.includes(sessionUser.role)) throw new MockApiError(403, "Forbidden");
      return { user: sessionUser };
    },
    handleApiError: (err: unknown) => {
      if (err instanceof MockApiError) return NextResponse.json({ error: err.message }, { status: err.status });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    },
  };
});

vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => auditLogCreate(...a) }));
vi.mock("@/lib/notifications", () => ({ createNotification: (...a: unknown[]) => notificationCreate(...a) }));

const { PATCH } = await import("./route");

function req(body: unknown) {
  return new NextRequest(new Request("https://x.test/api/properties/p1/report/rep1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}

function params() {
  return { params: Promise.resolve({ id: "p1", reportId: "rep1" }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: "admin1", role: "ADMIN" };
  propertyReportFindFirst.mockResolvedValue({ id: "rep1", propertyId: "p1", status: "PENDING", reportedById: "fe1", property: { title: "Spacious 2 BHK" } });
});

describe("PATCH /api/properties/[id]/report/[reportId]", () => {
  it("rejects FIELD_EXECUTIVE with 403", async () => {
    sessionUser = { id: "fe1", role: "FIELD_EXECUTIVE" };
    const res = await PATCH(req({ status: "RESOLVED" }), params());
    expect(res.status).toBe(403);
  });

  it("409s when already resolved", async () => {
    propertyReportFindFirst.mockResolvedValue({ id: "rep1", propertyId: "p1", status: "RESOLVED", reportedById: "fe1", property: { title: "X" } });
    const res = await PATCH(req({ status: "RESOLVED" }), params());
    expect(res.status).toBe(409);
  });

  it("resolves the report and notifies the reporter", async () => {
    const res = await PATCH(req({ status: "RESOLVED", resolutionNote: "Rent updated" }), params());
    expect(res.status).toBe(200);
    expect(propertyReportUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "RESOLVED" }) }));
    expect(notificationCreate).toHaveBeenCalledWith(expect.objectContaining({ userId: "fe1", type: "PROPERTY_REPORT_RESOLVED" }));
  });

  it("allows DATA_MANAGER to dismiss a report", async () => {
    sessionUser = { id: "dm1", role: "DATA_MANAGER" };
    const res = await PATCH(req({ status: "DISMISSED" }), params());
    expect(res.status).toBe(200);
  });
});
