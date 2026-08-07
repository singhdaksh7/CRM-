import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const availabilityReportFindFirst = vi.fn();
const availabilityReportUpdate = vi.fn();
const propertyUpdate = vi.fn();
const activityCreate = vi.fn();
const auditLogCreate = vi.fn();
const notificationCreate = vi.fn();
const propertyTimelineEventCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    propertyAvailabilityReport: {
      findFirst: (...a: unknown[]) => availabilityReportFindFirst(...a),
      update: (...a: unknown[]) => availabilityReportUpdate(...a),
    },
    property: { update: (...a: unknown[]) => propertyUpdate(...a) },
    activity: { create: (...a: unknown[]) => activityCreate(...a) },
    auditLog: { create: (...a: unknown[]) => auditLogCreate(...a) },
    notification: { create: (...a: unknown[]) => notificationCreate(...a) },
    propertyTimelineEvent: { create: (...a: unknown[]) => propertyTimelineEventCreate(...a) },
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
  return new NextRequest(new Request("https://x.test/api/properties/p1/availability-report/rep1/review", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}

function params() {
  return { params: Promise.resolve({ id: "p1", reportId: "rep1" }) };
}

function REPORT(overrides = {}) {
  return { id: "rep1", propertyId: "p1", organizationId: "org_default", status: "PENDING", reason: "ALREADY_RENTED", reportedById: "fe1", property: { title: "Spacious 2 BHK" }, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: "admin1", role: "ADMIN" };
  availabilityReportFindFirst.mockResolvedValue(REPORT());
});

describe("PATCH /api/properties/[id]/availability-report/[reportId]/review", () => {
  it("rejects non-ADMIN roles", async () => {
    sessionUser = { id: "dm1", role: "DATA_MANAGER" };
    const res = await PATCH(req({ decision: "APPROVE" }), params());
    expect(res.status).toBe(403);
  });

  it("404s when the report doesn't exist", async () => {
    availabilityReportFindFirst.mockResolvedValue(null);
    const res = await PATCH(req({ decision: "APPROVE" }), params());
    expect(res.status).toBe(404);
  });

  it("409s when the report was already reviewed", async () => {
    availabilityReportFindFirst.mockResolvedValue(REPORT({ status: "APPROVED" }));
    const res = await PATCH(req({ decision: "APPROVE" }), params());
    expect(res.status).toBe(409);
  });

  it("APPROVE with ALREADY_RENTED sets the property status to RENTED and clears pendingVerification", async () => {
    const res = await PATCH(req({ decision: "APPROVE" }), params());
    expect(res.status).toBe(200);
    expect(propertyUpdate).toHaveBeenCalledWith({ where: { id: "p1" }, data: { pendingVerification: false, status: "RENTED" } });
  });

  it("APPROVE with OWNER_UNREACHABLE clears pendingVerification but does not change status", async () => {
    availabilityReportFindFirst.mockResolvedValue(REPORT({ reason: "OWNER_UNREACHABLE" }));
    await PATCH(req({ decision: "APPROVE" }), params());
    expect(propertyUpdate).toHaveBeenCalledWith({ where: { id: "p1" }, data: { pendingVerification: false } });
  });

  it("REJECT clears pendingVerification without changing status, regardless of reason", async () => {
    const res = await PATCH(req({ decision: "REJECT" }), params());
    expect(res.status).toBe(200);
    expect(propertyUpdate).toHaveBeenCalledWith({ where: { id: "p1" }, data: { pendingVerification: false } });
  });

  it("notifies the original reporter", async () => {
    await PATCH(req({ decision: "APPROVE" }), params());
    expect(notificationCreate).toHaveBeenCalledWith(expect.objectContaining({ userId: "fe1", type: "AVAILABILITY_REPORT_APPROVED" }));
  });
});
