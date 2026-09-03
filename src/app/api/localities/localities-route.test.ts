import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Real, org-filtered fake data (not a bare vi.fn()) - matches the isolation
// test pattern used elsewhere (e.g. property-images-org-isolation.test.ts) -
// so a dropped organizationId filter would actually leak a row and fail
// these tests, not just look plausible.
const ORG_A = "org_a";
const ORG_B = "org_b";
type LocalityRow = { id: string; organizationId: string; name: string; normalizedName: string };
let localities: LocalityRow[] = [];
function resetFixtures() {
  localities = [
    { id: "loc-a1", organizationId: ORG_A, name: "Janakpuri", normalizedName: "janakpuri" },
    { id: "loc-a2", organizationId: ORG_A, name: "Basai Darapur", normalizedName: "basai darapur" },
    { id: "loc-b1", organizationId: ORG_B, name: "Kirti Nagar", normalizedName: "kirti nagar" },
  ];
}
resetFixtures();

type Where = { id?: string; organizationId_normalizedName?: { organizationId: string; normalizedName: string }; organizationId?: string; name?: { contains: string; mode: string } };

const findMany = vi.fn(async (args: { where: Where }) =>
  localities.filter(
    (l) =>
      l.organizationId === args.where.organizationId &&
      (!args.where.name || l.name.toLowerCase().includes(args.where.name.contains.toLowerCase()))
  )
);
// Real fake, not an ad-hoc once-mock: handles both call shapes the route's
// code path actually uses - the "does it already exist" lookup by
// organizationId_normalizedName (inside resolveOrCreatePropertyLocality),
// and the "fetch what I just created/found" lookup by id (in the route
// itself) - and `create` actually appends to the shared fixture array, so
// the second lookup finds what the first step produced, like a real DB.
const findUnique = vi.fn(async (args: { where: Where }) => {
  if (args.where.id) return localities.find((l) => l.id === args.where.id) ?? null;
  if (args.where.organizationId_normalizedName) {
    const { organizationId, normalizedName } = args.where.organizationId_normalizedName;
    return localities.find((l) => l.organizationId === organizationId && l.normalizedName === normalizedName) ?? null;
  }
  return null;
});
let nextId = 100;
const create = vi.fn(async (args: { data: { organizationId: string; name: string; normalizedName: string } }) => {
  const row = { id: `loc-new-${nextId++}`, ...args.data };
  localities.push(row);
  return { id: row.id };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    propertyLocality: {
      findMany: (...a: unknown[]) => findMany(...(a as [never])),
      findUnique: (...a: unknown[]) => findUnique(...(a as [never])),
      create: (...a: unknown[]) => create(...(a as [never])),
    },
  },
}));

let currentUser = { id: "admin-a", role: "ADMIN", organizationId: ORG_A };
vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return {
    ApiError,
    requireSession: async (roles?: string[]) => {
      if (roles && !roles.includes(currentUser.role)) throw new ApiError(403, "Forbidden");
      return { user: currentUser };
    },
    // Mirrors the real handleApiError's ApiError/ZodError/500 branches
    // closely enough for these tests - see src/lib/api-auth.ts.
    handleApiError: (err: unknown) => {
      if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err && typeof err === "object" && "issues" in err) return NextResponse.json({ error: "Validation failed" }, { status: 400 });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    },
  };
});
vi.mock("@/lib/organization", () => ({ getOrganizationId: (u: { organizationId: string }) => u.organizationId }));

const { GET, POST } = await import("./route");

function getReq(query: string) {
  return new NextRequest(new Request(`https://x.test/api/localities${query}`));
}
function postReq(body: unknown) {
  return new NextRequest(new Request("https://x.test/api/localities", { method: "POST", body: JSON.stringify(body) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  currentUser = { id: "admin-a", role: "ADMIN", organizationId: ORG_A };
  resetFixtures();
});

describe("GET /api/localities", () => {
  it("lists only the caller's own organization's localities", async () => {
    const res = await GET(getReq(""));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.localities.map((l: { name: string }) => l.name)).toEqual(["Janakpuri", "Basai Darapur"]);
  });

  it("searches case-insensitively", async () => {
    const res = await GET(getReq("?q=basai"));
    const body = await res.json();
    expect(body.localities.map((l: { name: string }) => l.name)).toEqual(["Basai Darapur"]);
  });

  it("never returns another organization's localities even when searched by name", async () => {
    const res = await GET(getReq("?q=kirti"));
    const body = await res.json();
    expect(body.localities).toEqual([]);
  });

  it("any authenticated role may search (read is not privileged)", async () => {
    currentUser = { id: "fe-a", role: "FIELD_EXECUTIVE", organizationId: ORG_A };
    const res = await GET(getReq(""));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/localities", () => {
  it("ADMIN can add a new locality", async () => {
    const res = await POST(postReq({ name: "Punjabi Bagh" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.locality.name).toBe("Punjabi Bagh");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: ORG_A, name: "Punjabi Bagh" }) }));
  });

  it("DATA_MANAGER can add a new locality, and it becomes selectable for future properties immediately", async () => {
    currentUser = { id: "dm-a", role: "DATA_MANAGER", organizationId: ORG_A };
    const res = await POST(postReq({ name: "Moti Nagar" }));
    expect(res.status).toBe(201);

    const listRes = await GET(getReq("?q=moti"));
    const listBody = await listRes.json();
    expect(listBody.localities.map((l: { name: string }) => l.name)).toEqual(["Moti Nagar"]);
  });

  it("FIELD_EXECUTIVE is denied - locality management stays ADMIN/DATA_MANAGER only", async () => {
    currentUser = { id: "fe-a", role: "FIELD_EXECUTIVE", organizationId: ORG_A };
    const res = await POST(postReq({ name: "Somewhere New" }));
    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a too-short name", async () => {
    const res = await POST(postReq({ name: "A" }));
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("reuses an existing locality (case-insensitive) instead of creating a duplicate", async () => {
    findUnique.mockImplementation(async () => localities[0]);
    const res = await POST(postReq({ name: "janakpuri" }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.locality.id).toBe("loc-a1");
  });
});
