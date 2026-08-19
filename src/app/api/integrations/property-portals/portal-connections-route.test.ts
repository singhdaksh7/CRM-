import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Portal connection API: ADMIN-only, organization-scoped, and structurally
 * incapable of echoing a stored credential reference or provider config back
 * over the wire - even to an admin.
 */

const findMany = vi.fn();
const findFirst = vi.fn();
const create = vi.fn();
const update = vi.fn();
const recordAudit = vi.fn();
let sessionRole = "ADMIN";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    propertyPortalConnection: {
      findMany: (...a: unknown[]) => findMany(...a),
      findFirst: (...a: unknown[]) => findFirst(...a),
      create: (...a: unknown[]) => create(...a),
      update: (...a: unknown[]) => update(...a),
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
    requireSession: async (roles: string[]) => {
      if (!roles.includes(sessionRole)) throw new MockApiError(403, "Forbidden");
      return { user: { id: "admin1", role: sessionRole } };
    },
    // Mirrors the real handleApiError: ApiError and Zod validation both
    // surface as client errors, anything else is an opaque 500.
    handleApiError: (err: unknown) => {
      if (err instanceof MockApiError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err && typeof err === "object" && "issues" in err) return NextResponse.json({ error: "Validation failed" }, { status: 400 });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    },
  };
});

vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));

const { GET, POST } = await import("./route");

function request(body: unknown) {
  return new NextRequest(new Request("https://x.test/api/integrations/property-portals", { method: "POST", body: JSON.stringify(body) }));
}

const storedConnection = {
  id: "conn1",
  organizationId: "org_default",
  provider: "HOUSING",
  status: "PARTNER_ACCESS_REQUIRED",
  connectionMode: "MANUAL",
  displayName: "Housing (demo)",
  accountReference: "ACC-1",
  credentialReference: "vault://super-secret-key",
  config: '{"token":"do-not-leak"}',
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionRole = "ADMIN";
  findMany.mockResolvedValue([storedConnection]);
  findFirst.mockResolvedValue(null);
  create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...storedConnection, ...data, id: "conn-new" }));
  update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...storedConnection, ...data }));
});

describe("GET /api/integrations/property-portals", () => {
  it("never returns the credential reference or raw config", async () => {
    const body = await (await GET()).json();
    expect(body.connections[0].credentialReference).toBeUndefined();
    expect(body.connections[0].config).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("super-secret-key");
    expect(JSON.stringify(body)).not.toContain("do-not-leak");
  });

  it("still returns the truthful capability/connection state", async () => {
    const body = await (await GET()).json();
    expect(body.connections[0]).toMatchObject({ provider: "HOUSING", status: "PARTNER_ACCESS_REQUIRED", connectionMode: "MANUAL" });
  });

  it("scopes the query to the caller's organization", async () => {
    await GET();
    expect(findMany.mock.calls[0][0].where).toEqual({ organizationId: "org_default" });
  });

  it("is refused for a data manager", async () => {
    sessionRole = "DATA_MANAGER";
    expect((await GET()).status).toBe(403);
  });

  it("is refused for a field executive", async () => {
    sessionRole = "FIELD_EXECUTIVE";
    expect((await GET()).status).toBe(403);
  });
});

describe("POST /api/integrations/property-portals", () => {
  it("creates a connection scoped to the caller's organization", async () => {
    const res = await POST(request({ provider: "MAGICBRICKS", connectionMode: "CSV", status: "NOT_CONFIGURED" }));
    expect(res.status).toBe(201);
    expect(create.mock.calls[0][0].data.organizationId).toBe("org_default");
  });

  it("refuses to mark any provider CONNECTED - no official contract exists", async () => {
    const res = await POST(request({ provider: "HOUSING", connectionMode: "API", status: "CONNECTED" }));
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an unknown provider", async () => {
    const res = await POST(request({ provider: "SOME_SCRAPER", connectionMode: "API" }));
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an unknown connection mode", async () => {
    const res = await POST(request({ provider: "OLX", connectionMode: "SCRAPE" }));
    expect(res.status).toBe(400);
  });

  it("updates in place instead of duplicating when the account reference already exists", async () => {
    findFirst.mockResolvedValue(storedConnection);
    const res = await POST(request({ provider: "HOUSING", connectionMode: "WEBHOOK", accountReference: "ACC-1", status: "DEGRADED" }));
    expect(res.status).toBe(200);
    expect(create).not.toHaveBeenCalled();
    expect(update.mock.calls[0][0].where).toEqual({ id: "conn1" });
  });

  it("looks for the existing row only within the caller's organization", async () => {
    await POST(request({ provider: "HOUSING", connectionMode: "MANUAL", accountReference: "ACC-1" }));
    expect(findFirst.mock.calls[0][0].where.organizationId).toBe("org_default");
  });

  it("never echoes a submitted credential reference back to the client", async () => {
    const res = await POST(request({ provider: "OLX", connectionMode: "EMAIL", credentialReference: "vault://another-secret" }));
    expect(JSON.stringify(await res.json())).not.toContain("another-secret");
  });

  it("records an audit entry without leaking the credential reference", async () => {
    await POST(request({ provider: "OLX", connectionMode: "EMAIL", credentialReference: "vault://another-secret" }));
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(recordAudit.mock.calls[0][0])).not.toContain("another-secret");
  });

  it("is refused for a data manager", async () => {
    sessionRole = "DATA_MANAGER";
    expect((await POST(request({ provider: "OLX", connectionMode: "EMAIL" }))).status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("is refused for a field executive", async () => {
    sessionRole = "FIELD_EXECUTIVE";
    expect((await POST(request({ provider: "OLX", connectionMode: "EMAIL" }))).status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });
});
