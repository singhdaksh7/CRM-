import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const propertyFindFirst = vi.fn();
const propertyImageFindFirst = vi.fn();
const visitFindFirst = vi.fn();
const availabilityReportCreate = vi.fn();
const propertyUpdate = vi.fn();
const activityCreate = vi.fn();
const auditLogCreate = vi.fn();
const notificationCreate = vi.fn();
const propertyTimelineEventCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    property: { findFirst: (...a: unknown[]) => propertyFindFirst(...a), update: (...a: unknown[]) => propertyUpdate(...a) },
    propertyImage: { findFirst: (...a: unknown[]) => propertyImageFindFirst(...a) },
    visit: { findFirst: (...a: unknown[]) => visitFindFirst(...a) },
    propertyAvailabilityReport: { create: (...a: unknown[]) => availabilityReportCreate(...a) },
    activity: { create: (...a: unknown[]) => activityCreate(...a) },
    auditLog: { create: (...a: unknown[]) => auditLogCreate(...a) },
    notification: { create: (...a: unknown[]) => notificationCreate(...a) },
    propertyTimelineEvent: { create: (...a: unknown[]) => propertyTimelineEventCreate(...a) },
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
  return new NextRequest(new Request("https://x.test/api/properties/p1/availability-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}

function params() {
  return { params: Promise.resolve({ id: "p1" }) };
}

const VALID_BODY = { reason: "ALREADY_RENTED", photoId: "img1" };

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: "fe1", role: "FIELD_EXECUTIVE" };
  propertyFindFirst.mockResolvedValue({ id: "p1", title: "Spacious 2 BHK" });
  propertyImageFindFirst.mockResolvedValue({ id: "img1", purpose: "AVAILABILITY_REPORT" });
  availabilityReportCreate.mockResolvedValue({ id: "rep1" });
});

describe("POST /api/properties/[id]/availability-report", () => {
  it("404s when the property doesn't exist", async () => {
    propertyFindFirst.mockResolvedValue(null);
    const res = await POST(req(VALID_BODY), params());
    expect(res.status).toBe(404);
  });

  it("rejects a submission without a photoId at the Zod layer", async () => {
    const res = await POST(req({ reason: "ALREADY_RENTED", photoId: "" }), params());
    expect(res.status).toBe(400);
  });

  it("rejects when the referenced photo doesn't exist or isn't AVAILABILITY_REPORT purpose", async () => {
    propertyImageFindFirst.mockResolvedValue(null);
    const res = await POST(req(VALID_BODY), params());
    expect(res.status).toBe(400);
    expect(availabilityReportCreate).not.toHaveBeenCalled();
  });

  it("creates the report and marks the property pendingVerification on success", async () => {
    const res = await POST(req(VALID_BODY), params());
    expect(res.status).toBe(201);
    expect(propertyUpdate).toHaveBeenCalledWith({ where: { id: "p1" }, data: { pendingVerification: true } });
    expect(propertyTimelineEventCreate).toHaveBeenCalled();
  });

  it("rejects a visitId that doesn't belong to this property", async () => {
    visitFindFirst.mockResolvedValue(null);
    const res = await POST(req({ ...VALID_BODY, visitId: "v1" }), params());
    expect(res.status).toBe(400);
  });
});
