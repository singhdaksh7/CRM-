import { describe, it, expect, vi, beforeEach } from "vitest";

const availabilityReportFindMany = vi.fn();
const propertyReportFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    propertyAvailabilityReport: { findMany: (...a: unknown[]) => availabilityReportFindMany(...a) },
    propertyReport: { findMany: (...a: unknown[]) => propertyReportFindMany(...a) },
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

const { GET } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: "admin1", role: "ADMIN" };
});

describe("GET /api/admin/property-issues", () => {
  it("rejects FIELD_EXECUTIVE with 403", async () => {
    sessionUser = { id: "fe1", role: "FIELD_EXECUTIVE" };
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("merges availability reports and property reports into one sorted list", async () => {
    const older = new Date("2026-08-01T00:00:00Z");
    const newer = new Date("2026-08-05T00:00:00Z");
    availabilityReportFindMany.mockResolvedValue([{ id: "a1", reason: "ALREADY_RENTED", note: null, property: { id: "p1" }, reportedBy: { id: "u1", name: "Sagar" }, createdAt: older }]);
    propertyReportFindMany.mockResolvedValue([{ id: "r1", type: "WRONG_RENT", note: null, property: { id: "p2" }, reportedBy: { id: "u2", name: "Kanchan" }, createdAt: newer }]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.issues[0].id).toBe("r1"); // newer first
    expect(body.issues[0].issueType).toBe("REPORT");
    expect(body.issues[1].issueType).toBe("AVAILABILITY");
  });

  it("only queries PENDING status for both report types", async () => {
    availabilityReportFindMany.mockResolvedValue([]);
    propertyReportFindMany.mockResolvedValue([]);
    await GET();
    expect(availabilityReportFindMany.mock.calls[0][0].where.status).toBe("PENDING");
    expect(propertyReportFindMany.mock.calls[0][0].where.status).toBe("PENDING");
  });
});
