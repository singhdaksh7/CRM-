import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.fn();
const parseInventoryFile = vi.fn();
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
vi.mock("@/lib/inventory-import-parser", () => ({ parseInventoryFile }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit, rateLimitResponse: () => Response.json({ error: "Rate limited" }, { status: 429 }) }));

const { POST } = await import("./route");

function postForm(file: File | null) {
  const form = new FormData();
  if (file) form.set("file", file);
  return POST(new Request("http://localhost/api/imports/housing/parse", { method: "POST", body: form }) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  checkRateLimit.mockResolvedValue({ allowed: true });
});

describe("POST /api/imports/housing/parse", () => {
  it("rejects a FIELD_EXECUTIVE", async () => {
    class ApiErr extends Error {
      status = 403;
    }
    requireSession.mockRejectedValue(new ApiErr("Forbidden"));
    const response = await postForm(new File(["a,b"], "x.csv", { type: "text/csv" }));
    expect(response.status).toBe(403);
    expect(parseInventoryFile).not.toHaveBeenCalled();
  });

  it("rejects a request with no file", async () => {
    const response = await postForm(null);
    expect(response.status).toBe(400);
  });

  it("delegates the actual CSV/XLSX parsing (with its existing size/MIME/extension checks) to the shared safe parser, and suggests Housing-specific column mapping", async () => {
    parseInventoryFile.mockResolvedValue({ headers: ["Lead Name", "Lead Phone Number"], rows: [{ "Lead Name": "Asha", "Lead Phone Number": "9876543210" }], truncated: false });
    const response = await postForm(new File(["Lead Name,Lead Phone Number\nAsha,9876543210"], "housing.csv", { type: "text/csv" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.suggestedMapping["Lead Name"]).toBe("Lead Name");
    expect(body.suggestedMapping["Lead Phone Number"]).toBe("Lead Phone Number");
  });

  it("surfaces the shared parser's rejection of an unsafe file (e.g. legacy .xls) as a client error, not a 500", async () => {
    parseInventoryFile.mockRejectedValue(new Error("Legacy .xls files are not accepted safely. Save the workbook as .xlsx or .csv first."));
    const response = await postForm(new File(["binary"], "old.xls"));
    const body = await response.json();
    expect(body.error).toMatch(/xls/i);
  });
});
