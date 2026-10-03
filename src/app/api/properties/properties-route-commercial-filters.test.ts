import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Category + commercial-type filters on the two property list surfaces the
 * app's API exposes (GET /api/properties and the picker's
 * GET /api/properties/search). Both must stay organization-scoped, and a
 * SHOP filter must also find inventory stored under the legacy
 * COMMERCIAL_SHOP value.
 */

const propertyFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { property: { findMany: (...a: unknown[]) => propertyFindMany(...a) } },
}));
vi.mock("@/lib/property-images", () => ({ getCoverImageUrls: async () => ({}) }));
vi.mock("@/lib/organization", () => ({ getOrganizationId: (user: { organizationId: string }) => user.organizationId }));
vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    ApiError: class ApiError extends Error {},
    requireSession: async () => ({ user: { id: "admin1", role: "ADMIN", organizationId: "org-a" } }),
    handleApiError: (err: unknown) => NextResponse.json({ error: String(err) }, { status: 500 }),
  };
});

const { GET: listGET } = await import("./route");
const { GET: searchGET } = await import("./search/route");

function req(path: string) {
  return new NextRequest(new Request(`https://x.test${path}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  propertyFindMany.mockResolvedValue([]);
});

describe("GET /api/properties - commercial filters", () => {
  it("filters by category and commercial type (with legacy alias), org-scoped", async () => {
    await listGET(req("/api/properties?assetClass=COMMERCIAL&propertyType=SHOP"));
    const { where } = propertyFindMany.mock.calls[0][0];
    expect(where.organizationId).toBe("org-a");
    expect(where.assetClass).toBe("COMMERCIAL");
    expect(where.propertyType.in.sort()).toEqual(["COMMERCIAL_SHOP", "SHOP"]);
  });

  it("leaves residential listing queries untouched when no type is given", async () => {
    await listGET(req("/api/properties?assetClass=RESIDENTIAL&bhk=2"));
    const { where } = propertyFindMany.mock.calls[0][0];
    expect(where.assetClass).toBe("RESIDENTIAL");
    expect(where.bhk).toBe(2);
    expect(where).not.toHaveProperty("propertyType");
  });
});

describe("GET /api/properties/search - commercial search", () => {
  it("supports free-text search combined with a commercial type filter, and returns category/type", async () => {
    await searchGET(req("/api/properties/search?q=Rajouri&assetClass=COMMERCIAL&propertyType=OFFICE"));
    const args = propertyFindMany.mock.calls[0][0];
    expect(args.where.organizationId).toBe("org-a");
    expect(args.where.assetClass).toBe("COMMERCIAL");
    expect(args.where.propertyType.in.sort()).toEqual(["COMMERCIAL_OFFICE", "OFFICE"]);
    expect(args.where.OR.length).toBeGreaterThan(0);
    expect(args.select.assetClass).toBe(true);
    expect(args.select.propertyType).toBe(true);
    // The picker select never widens to private fields.
    expect(args.select).not.toHaveProperty("address");
    expect(args.select).not.toHaveProperty("ownerPhone");
  });

  it("ignores an unknown category value instead of passing it to Prisma", async () => {
    await searchGET(req("/api/properties/search?assetClass=SPACESHIP"));
    expect(propertyFindMany.mock.calls[0][0].where).not.toHaveProperty("assetClass");
  });
});
