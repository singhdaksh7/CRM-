import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const propertyFindFirst = vi.fn();
const propertyFavoriteUpsert = vi.fn();
const propertyFavoriteDeleteMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    property: { findFirst: (...a: unknown[]) => propertyFindFirst(...a) },
    propertyFavorite: {
      upsert: (...a: unknown[]) => propertyFavoriteUpsert(...a),
      deleteMany: (...a: unknown[]) => propertyFavoriteDeleteMany(...a),
    },
  },
}));

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

vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));

const { POST, DELETE } = await import("./route");

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req() {
  return new NextRequest(new Request("https://x.test/api/properties/p1/favorite", { method: "POST" }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/properties/[id]/favorite", () => {
  it("404s when the property doesn't exist", async () => {
    propertyFindFirst.mockResolvedValue(null);
    const res = await POST(req(), params("p1"));
    expect(res.status).toBe(404);
  });

  it("upserts a favorite for the current user", async () => {
    propertyFindFirst.mockResolvedValue({ id: "p1" });
    const res = await POST(req(), params("p1"));
    expect(res.status).toBe(200);
    expect(propertyFavoriteUpsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId_propertyId: { userId: "fe1", propertyId: "p1" } } }));
  });
});

describe("DELETE /api/properties/[id]/favorite", () => {
  it("removes the favorite for the current user only", async () => {
    const res = await DELETE(req(), params("p1"));
    expect(res.status).toBe(200);
    expect(propertyFavoriteDeleteMany).toHaveBeenCalledWith({ where: { userId: "fe1", propertyId: "p1" } });
  });
});
