import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.fn();
const runHousingImport = vi.fn();
const checkRateLimit = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireSession,
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  handleApiError: (error: { status?: number; message: string }) => Response.json({ error: error.message }, { status: error.status ?? 500 }),
}));
vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org-1" }));
vi.mock("@/lib/housing-import", () => ({ runHousingImport }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit, rateLimitResponse: () => Response.json({ error: "Rate limited" }, { status: 429 }) }));

const { POST } = await import("./route");

const VALID_BODY = {
  rows: [{ "Lead Name": "Asha", "Lead Phone Number": "9876543210", Locality: "Janakpuri" }],
  columnMapping: { "Lead Name": "Lead Name", "Lead Phone Number": "Lead Phone Number", Locality: "Locality" },
  fileName: "housing.csv",
  confirm: true,
};

function post(body: unknown) {
  return POST(new Request("http://localhost/api/imports/housing", { method: "POST", body: JSON.stringify(body) }) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  checkRateLimit.mockResolvedValue({ allowed: true });
});

describe("POST /api/imports/housing", () => {
  it("rejects a FIELD_EXECUTIVE with 403 before ever reaching runHousingImport", async () => {
    class ApiErr extends Error {
      status = 403;
    }
    requireSession.mockRejectedValue(new ApiErr("Forbidden"));
    const response = await post(VALID_BODY);
    expect(response.status).toBe(403);
    expect(runHousingImport).not.toHaveBeenCalled();
  });

  it("requires explicit confirm before importing anything", async () => {
    const response = await post({ ...VALID_BODY, confirm: false });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Import requires explicit confirmation" });
    expect(runHousingImport).not.toHaveBeenCalled();
  });

  it("imports on confirm:true and passes the authenticated user's organizationId, never a client-supplied one", async () => {
    runHousingImport.mockResolvedValue({ jobId: "job-1", summary: { total: 1, imported: 1, duplicatesSkippedOrMatched: 0, needsReview: 0, invalid: 0, failed: 0 }, rows: [] });
    const response = await post({ ...VALID_BODY, organizationId: "attacker-org" });
    expect(response.status).toBe(201);
    expect(runHousingImport).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", actorId: "admin-1" }));
  });

  it("is rate-limited like other import surfaces", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false });
    const response = await post(VALID_BODY);
    expect(response.status).toBe(429);
    expect(runHousingImport).not.toHaveBeenCalled();
  });
});
