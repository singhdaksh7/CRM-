import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.fn();
const runImport = vi.fn();
const checkRateLimit = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: { importJob: { findMany: vi.fn(), count: vi.fn() } } }));
vi.mock("@/lib/api-auth", () => ({
  requireSession,
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  handleApiError: (error: { status?: number; message: string }) =>
    Response.json({ error: error.message }, { status: error.status ?? 500 }),
}));
vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org-1" }));
vi.mock("@/lib/imports", () => ({ runImport }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit,
  rateLimitResponse: () => Response.json({ error: "Rate limited" }, { status: 429 }),
}));

const { POST } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  checkRateLimit.mockResolvedValue({ allowed: true });
});

describe("POST /api/imports", () => {
  it("routes property imports through the Phase 7 preview and confirmation workflow", async () => {
    const response = await POST(new Request("http://localhost/api/imports", {
      method: "POST",
      body: JSON.stringify({
        entityType: "PROPERTIES",
        fileName: "inventory.csv",
        rows: [{ Locality: "Janakpuri" }],
        columnMapping: { Locality: "area" },
      }),
    }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Property imports must use the inventory import preview and confirmation workflow",
    });
    expect(runImport).not.toHaveBeenCalled();
  });

  it("keeps the generic workflow available for non-property imports", async () => {
    runImport.mockResolvedValue({ job: { id: "job-1" }, outcomes: [] });
    const response = await POST(new Request("http://localhost/api/imports", {
      method: "POST",
      body: JSON.stringify({
        entityType: "LEADS",
        fileName: "leads.csv",
        rows: [{ Name: "Client" }],
        columnMapping: { Name: "name" },
      }),
    }) as never);

    expect(response.status).toBe(201);
    expect(runImport).toHaveBeenCalledWith(expect.objectContaining({ entityType: "LEADS" }));
  });
});
