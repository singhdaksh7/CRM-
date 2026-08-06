import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const propertyFindFirst = vi.fn();
const propertyUpdate = vi.fn();
const activityCreate = vi.fn();
const auditLogCreate = vi.fn();
const propertyTimelineEventCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    property: { findFirst: (...a: unknown[]) => propertyFindFirst(...a), update: (...a: unknown[]) => propertyUpdate(...a) },
    activity: { create: (...a: unknown[]) => activityCreate(...a) },
    auditLog: { create: (...a: unknown[]) => auditLogCreate(...a) },
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
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    },
  };
});

vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => auditLogCreate(...a) }));

const { POST } = await import("./route");

function params() {
  return { params: Promise.resolve({ id: "p1" }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: "fe1", role: "FIELD_EXECUTIVE" };
  propertyFindFirst.mockResolvedValue({ id: "p1", title: "Spacious 2 BHK" });
  propertyUpdate.mockResolvedValue({ id: "p1", lastVerifiedAt: new Date() });
});

describe("POST /api/properties/[id]/verify", () => {
  it("404s when the property doesn't exist", async () => {
    propertyFindFirst.mockResolvedValue(null);
    const res = await POST(new NextRequest(new Request("https://x.test/api/properties/p1/verify", { method: "POST" })), params());
    expect(res.status).toBe(404);
  });

  it("sets lastVerifiedAt/lastVerifiedById and logs activity/audit/timeline", async () => {
    const res = await POST(new NextRequest(new Request("https://x.test/api/properties/p1/verify", { method: "POST" })), params());
    expect(res.status).toBe(200);
    expect(propertyUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lastVerifiedById: "fe1" }) }));
    expect(activityCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "PROPERTY_VERIFIED" }) }));
    expect(propertyTimelineEventCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: "VERIFIED" }) }));
  });
});
