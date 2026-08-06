import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const propertyTimelineEventFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { propertyTimelineEvent: { findMany: (...a: unknown[]) => propertyTimelineEventFindMany(...a) } },
}));

vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireSession: async () => ({ user: { id: "admin1", role: "ADMIN" } }),
    handleApiError: (err: unknown) => NextResponse.json({ error: String(err) }, { status: 500 }),
  };
});

const { GET } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/properties/[id]/timeline", () => {
  it("returns events oldest first", async () => {
    propertyTimelineEventFindMany.mockResolvedValue([{ id: "e1", eventType: "CREATED" }]);
    const res = await GET(new NextRequest(new Request("https://x.test/api/properties/p1/timeline")), { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(200);
    expect(propertyTimelineEventFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { propertyId: "p1" }, orderBy: { createdAt: "asc" } }));
    const body = await res.json();
    expect(body.events).toHaveLength(1);
  });
});
