import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const catalogueShareFindUnique = vi.fn();
const leadFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    catalogueShare: { findFirst: (...a: unknown[]) => catalogueShareFindUnique(...a) },
    lead: { findFirst: (...a: unknown[]) => leadFindFirst(...a) },
  },
}));

vi.mock("@/lib/organization", () => ({ getOrganizationId: (u: { organizationId: string }) => u.organizationId }));

let sessionUser: { id: string; role: string; organizationId: string } | null = { id: "fe1", role: "FIELD_EXECUTIVE", organizationId: "org_default" };

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
      if (!sessionUser) throw new MockApiError(401, "Unauthorized");
      if (allowedRoles && !allowedRoles.includes(sessionUser.role)) throw new MockApiError(403, "Forbidden");
      return { user: sessionUser };
    },
    handleApiError: (err: unknown) => {
      if (err instanceof MockApiError) return NextResponse.json({ error: err.message }, { status: err.status });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    },
  };
});

const CATALOGUE = {
  id: "cat1",
  organizationId: "org_default",
  token: "abc123",
  leadId: "lead1",
  title: "Shortlist for Rahul",
  status: "ACTIVE",
  version: 1,
  lead: { clientName: "Rahul Sharma", assignedTo: null },
  properties: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: "fe1", role: "FIELD_EXECUTIVE", organizationId: "org_default" };
  // getCatalogueById is findFirst({ where: { id, organizationId } }) - a
  // cross-org id must resolve to null exactly like a real Prisma query
  // scoped by organizationId would, not just echo the fixture back.
  catalogueShareFindUnique.mockImplementation(async ({ where }: { where: { id: string; organizationId: string } }) =>
    where.organizationId === CATALOGUE.organizationId ? CATALOGUE : null
  );
});

describe("GET /api/catalogues/[id]/internal", () => {
  it("returns the executive DTO for the assigned executive's own lead", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead1", assignedToId: "fe1" });
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(new Request("https://x.test/api/catalogues/cat1/internal")), { params: Promise.resolve({ id: "cat1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.catalogue.clientName).toBe("Rahul Sharma");
  });

  it("denies a FIELD_EXECUTIVE for a lead not assigned to them", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead1", assignedToId: "someone-else" });
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(new Request("https://x.test/api/catalogues/cat1/internal")), { params: Promise.resolve({ id: "cat1" }) });
    expect(res.status).toBe(403);
  });

  it("allows ADMIN regardless of assignment", async () => {
    sessionUser = { id: "admin1", role: "ADMIN", organizationId: "org_default" };
    leadFindFirst.mockResolvedValue({ id: "lead1", assignedToId: "someone-else" });
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(new Request("https://x.test/api/catalogues/cat1/internal")), { params: Promise.resolve({ id: "cat1" }) });
    expect(res.status).toBe(200);
  });

  it("denies an anonymous (unauthenticated) request", async () => {
    sessionUser = null;
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(new Request("https://x.test/api/catalogues/cat1/internal")), { params: Promise.resolve({ id: "cat1" }) });
    expect(res.status).toBe(401);
  });

  it("404s a catalogue id belonging to a different organization", async () => {
    sessionUser = { id: "admin2", role: "ADMIN", organizationId: "org_other" };
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(new Request("https://x.test/api/catalogues/cat1/internal")), { params: Promise.resolve({ id: "cat1" }) });
    expect(res.status).toBe(404);
    expect(leadFindFirst).not.toHaveBeenCalled();
  });
});
