import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const runOlxSync = vi.fn();
const recordAudit = vi.fn();
const checkRateLimit = vi.fn();
let session: { id: string; role: string; organizationId: string } | null;

vi.mock("@/integrations/olx/sync", () => ({ runOlxSync: (...args: unknown[]) => runOlxSync(...args) }));
vi.mock("@/lib/api-auth", () => ({
  requireSession: async (roles: string[]) => {
    if (!session) throw Object.assign(new Error("Unauthorized"), { status: 401 });
    if (!roles.includes(session.role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
    return { user: session };
  },
  handleApiError: (error: unknown) => NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: typeof error === "object" && error && "status" in error ? Number(error.status) : 500 }),
}));
vi.mock("@/lib/organization", () => ({ getOrganizationId: (user: { organizationId: string }) => user.organizationId }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: (...args: unknown[]) => checkRateLimit(...args), rateLimitResponse: () => NextResponse.json({ error: "Rate limited" }, { status: 429 }) }));
vi.mock("@/lib/audit", () => ({ recordAudit: (...args: unknown[]) => recordAudit(...args) }));
vi.mock("@/lib/prisma", () => ({ prisma: { propertyPortalConnection: { findFirst: vi.fn() }, externalLeadEvent: { count: vi.fn() } } }));

const { POST } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  session = { id: "admin_a", role: "ADMIN", organizationId: "org_a" };
  checkRateLimit.mockResolvedValue({ allowed: true });
  runOlxSync.mockResolvedValue({ configured: true, results: [] });
  recordAudit.mockResolvedValue(undefined);
});

describe("POST /api/integrations/property-portals/olx/sync", () => {
  it("passes the authenticated organization to the sync before any connection lookup", async () => {
    expect((await POST()).status).toBe(200);
    expect(runOlxSync).toHaveBeenCalledWith({ organizationId: "org_a" });
  });

  it("does not permit a field executive to trigger a sync", async () => {
    session = { id: "field_a", role: "FIELD_EXECUTIVE", organizationId: "org_a" };
    expect((await POST()).status).toBe(403);
    expect(runOlxSync).not.toHaveBeenCalled();
  });

  it("does not permit an unauthenticated request to trigger a sync", async () => {
    session = null;
    expect((await POST()).status).toBe(401);
    expect(runOlxSync).not.toHaveBeenCalled();
  });
});
