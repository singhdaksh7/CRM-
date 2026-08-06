import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getExecutiveDashboardData = vi.fn();

vi.mock("@/lib/executive-dashboard-data", () => ({
  getExecutiveDashboardData: (...a: unknown[]) => getExecutiveDashboardData(...a),
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

const { GET } = await import("./route");

function req(qs = "") {
  return new NextRequest(new Request(`https://x.test/api/executive/today${qs}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: "fe1", role: "FIELD_EXECUTIVE" };
  getExecutiveDashboardData.mockResolvedValue({ todaysVisits: [] });
});

describe("GET /api/executive/today", () => {
  it("loads the current user's own dashboard by default", async () => {
    await GET(req());
    expect(getExecutiveDashboardData).toHaveBeenCalledWith("fe1");
  });

  it("a FIELD_EXECUTIVE cannot view another executive's dashboard via employeeId", async () => {
    const res = await GET(req("?employeeId=fe2"));
    expect(res.status).toBe(403);
  });

  it("ADMIN can view a specific executive's dashboard via employeeId", async () => {
    sessionUser = { id: "admin1", role: "ADMIN" };
    await GET(req("?employeeId=fe2"));
    expect(getExecutiveDashboardData).toHaveBeenCalledWith("fe2");
  });

  it("DATA_MANAGER can view a specific executive's dashboard via employeeId", async () => {
    sessionUser = { id: "dm1", role: "DATA_MANAGER" };
    await GET(req("?employeeId=fe2"));
    expect(getExecutiveDashboardData).toHaveBeenCalledWith("fe2");
  });
});
