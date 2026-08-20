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

vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireSession: async () => ({ user: { id: "admin1", role: "ADMIN" } }),
    handleApiError: (err: unknown) => NextResponse.json({ error: err instanceof Error ? err.message : "Internal server error" }, { status: 500 }),
  };
});

const { GET } = await import("./route");

function getRequest(query = "") {
  return new NextRequest(new Request(`https://x.test/api/properties${query}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  propertyFindMany.mockResolvedValue([]);
});

/**
 * GET /api/properties backs EntityPicker's as-you-type "link a document to
 * a property" search (src/components/documents/entity-picker.tsx), which
 * already sends `take=10`. It previously ran an unbounded findMany() with
 * that parameter silently ignored - these tests pin the fix (bounded via
 * src/lib/pagination.ts's readTake/readSkip) so it can't regress back to
 * an unbounded query.
 */
describe("GET /api/properties - bounded pagination", () => {
  it("passes a bounded default take when the client sends none", async () => {
    await GET(getRequest());

    expect(propertyFindMany).toHaveBeenCalledTimes(1);
    const args = propertyFindMany.mock.calls[0][0];
    expect(typeof args.take).toBe("number");
    expect(args.take).toBeGreaterThan(0);
    expect(args.take).toBeLessThanOrEqual(200); // MAX_PAGE_SIZE in src/lib/pagination.ts
    expect(args.skip).toBe(0);
  });

  it("honors a client-supplied take", async () => {
    await GET(getRequest("?take=10"));

    const args = propertyFindMany.mock.calls[0][0];
    expect(args.take).toBe(10);
  });

  it("clamps an oversized take request instead of returning the entire table", async () => {
    await GET(getRequest("?take=999999"));

    const args = propertyFindMany.mock.calls[0][0];
    expect(args.take).toBeLessThanOrEqual(200);
  });
});
