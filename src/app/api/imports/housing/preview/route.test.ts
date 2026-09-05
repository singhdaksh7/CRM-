import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.fn();
const previewHousingImport = vi.fn();
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
  handleApiError: (error: { status?: number; message: string; issues?: unknown }) =>
    Response.json({ error: error.issues ? "Validation failed" : error.message }, { status: error.issues ? 400 : error.status ?? 500 }),
}));
vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org-1" }));
vi.mock("@/lib/housing-import", () => ({ previewHousingImport }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit, rateLimitResponse: () => Response.json({ error: "Rate limited" }, { status: 429 }) }));

const { POST } = await import("./route");

function post(body: unknown) {
  return POST(new Request("http://localhost/api/imports/housing/preview", { method: "POST", body: JSON.stringify(body) }) as never);
}

const VALID_BODY = {
  rows: [{ "Lead Name": "Asha", "Lead Phone Number": "9876543210", Locality: "Janakpuri" }],
  columnMapping: { "Lead Name": "Lead Name", "Lead Phone Number": "Lead Phone Number", Locality: "Locality" },
};

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: "admin-1", role: "DATA_MANAGER" } });
  checkRateLimit.mockResolvedValue({ allowed: true });
});

describe("POST /api/imports/housing/preview", () => {
  it("rejects a FIELD_EXECUTIVE", async () => {
    class ApiErr extends Error {
      status = 403;
    }
    requireSession.mockRejectedValue(new ApiErr("Forbidden"));
    const response = await post(VALID_BODY);
    expect(response.status).toBe(403);
    expect(previewHousingImport).not.toHaveBeenCalled();
  });

  it("rejects an oversized row payload before ever building a preview", async () => {
    const response = await post({ ...VALID_BODY, rows: Array.from({ length: 5001 }, () => VALID_BODY.rows[0]) });
    expect(response.status).toBe(400);
    expect(previewHousingImport).not.toHaveBeenCalled();
  });

  it("builds a preview for a valid ADMIN/DATA_MANAGER request, org-scoped", async () => {
    previewHousingImport.mockResolvedValue({ rows: [], summary: { total: 1, valid: 1, invalid: 0, duplicate: 0, needsReview: 0 } });
    const response = await post(VALID_BODY);
    expect(response.status).toBe(200);
    expect(previewHousingImport).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1" }));
  });
});
