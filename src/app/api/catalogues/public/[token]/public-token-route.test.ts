import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getCatalogueByToken = vi.fn();

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
    handleApiError: (err: unknown) => {
      if (err instanceof MockApiError) return NextResponse.json({ error: err.message }, { status: err.status });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    },
  };
});

vi.mock("@/lib/catalogues", () => ({
  getCatalogueByToken: (...a: unknown[]) => getCatalogueByToken(...a),
  toPublicCatalogueDTO: (catalogue: { token: string; title: string }) => ({
    token: catalogue.token,
    title: catalogue.title,
    // Sentinel-only DTO here - toPublicCatalogueDTO's own field-level
    // whitelisting (internalNotes/ownerPhone/latitude/etc never leaking) is
    // exhaustively covered by catalogue-dto.test.ts; this route test only
    // needs to prove the route wires token resolution to that DTO, not
    // re-verify every field it strips.
  }),
  withResolvedCoverImages: async (dto: unknown) => dto,
}));

const CATALOGUE = { id: "cat1", token: "valid-token", organizationId: "org_default", title: "Shortlist for Rahul" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/catalogues/public/[token]", () => {
  it("returns the public DTO for a valid token", async () => {
    getCatalogueByToken.mockResolvedValue(CATALOGUE);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(new Request("https://x.test/api/catalogues/public/valid-token")), {
      params: Promise.resolve({ token: "valid-token" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.catalogue.token).toBe("valid-token");
    expect(body.catalogue.title).toBe("Shortlist for Rahul");
  });

  it("404s an invalid/unknown token without leaking whether it ever existed", async () => {
    getCatalogueByToken.mockRejectedValue(new MockApiError(404, "Catalogue not found"));
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(new Request("https://x.test/api/catalogues/public/does-not-exist")), {
      params: Promise.resolve({ token: "does-not-exist" }),
    });
    expect(res.status).toBe(404);
  });
});
