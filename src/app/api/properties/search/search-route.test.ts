import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const propertyFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    property: {
      findMany: (...a: unknown[]) => propertyFindMany(...a),
    },
  },
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

let sessionUser: { id: string; role: string } | null = { id: "admin1", role: "ADMIN" };

vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    ApiError: MockApiError,
    requireSession: async () => {
      if (!sessionUser) throw new MockApiError(401, "Unauthorized");
      return { user: sessionUser };
    },
    handleApiError: (err: unknown) => {
      if (err instanceof MockApiError) return NextResponse.json({ error: err.message }, { status: err.status });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    },
  };
});

const { GET } = await import("./route");

function req(qs: string) {
  return new NextRequest(new Request(`https://x.test/api/properties/search${qs}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: "admin1", role: "ADMIN" };
  propertyFindMany.mockResolvedValue([]);
});

describe("GET /api/properties/search", () => {
  it("requires a session", async () => {
    sessionUser = null;
    const res = await GET(req(""));
    expect(res.status).toBe(401);
  });

  it("scopes the search to the current organization", async () => {
    await GET(req("?q=ramesh"));
    const args = propertyFindMany.mock.calls[0][0];
    expect(args.where.organizationId).toBe("org_default");
  });

  it("builds an OR clause across code/title/area/address for the free-text query", async () => {
    await GET(req("?q=ramesh"));
    const args = propertyFindMany.mock.calls[0][0];
    expect(args.where.OR).toEqual([
      { propertyCode: { contains: "ramesh" } },
      { title: { contains: "ramesh" } },
      { area: { contains: "ramesh" } },
      { address: { contains: "ramesh" } },
    ]);
  });

  it("omits the OR clause when no query is given", async () => {
    await GET(req(""));
    const args = propertyFindMany.mock.calls[0][0];
    expect(args.where.OR).toBeUndefined();
  });

  it("applies optional minRent/maxRent/bhk filters", async () => {
    await GET(req("?minRent=10000&maxRent=30000&bhk=2"));
    const args = propertyFindMany.mock.calls[0][0];
    expect(args.where.monthlyRent).toEqual({ gte: 10000, lte: 30000 });
    expect(args.where.bhk).toBe(2);
  });

  it("caps results at 20 and returns the properties array", async () => {
    propertyFindMany.mockResolvedValue([{ id: "p1" }]);
    const res = await GET(req("?q=x"));
    const args = propertyFindMany.mock.calls[0][0];
    expect(args.take).toBe(20);
    const body = await res.json();
    expect(body.properties).toEqual([{ id: "p1" }]);
  });
});
