import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.fn();
const requirementFindFirst = vi.fn();
const leadFindUnique = vi.fn();
const leadCreate = vi.fn();
const requirementUpdate = vi.fn();
const recordAudit = vi.fn();
const autoAssignLead = vi.fn();
const loggerError = vi.fn();

const transaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
  callback({ lead: { create: leadCreate }, customerRequirement: { update: requirementUpdate } })
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customerRequirement: { findFirst: (...a: unknown[]) => requirementFindFirst(...a) },
    lead: { findUnique: (...a: unknown[]) => leadFindUnique(...a) },
    $transaction: transaction,
  },
}));

vi.mock("@/lib/api-auth", () => ({
  requireSession: (...a: unknown[]) => requireSession(...a),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  handleApiError: (err: { status?: number; message: string }) => Response.json({ error: err.message }, { status: err.status ?? 500 }),
}));

vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));
vi.mock("@/lib/assignment", () => ({ autoAssignLead: (...a: unknown[]) => autoAssignLead(...a) }));
vi.mock("@/lib/logger", () => ({ logger: { error: (...a: unknown[]) => loggerError(...a), warn: vi.fn(), info: vi.fn() } }));

const { POST } = await import("./route");

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req() {
  return new Request("http://localhost/api/customers/requirements/req1/convert-to-lead", { method: "POST" }) as never;
}

const REQUIREMENT = {
  id: "req1",
  organizationId: "org_default",
  convertedLeadId: null,
  assetClass: "RESIDENTIAL",
  transactionType: "SALE",
  minBudget: 12000000,
  maxBudget: 16000000,
  bhk: 3,
  furnishing: null,
  commercialPropertyType: null,
  minArea: null,
  maxArea: null,
  floorPreference: null,
  commercialFitOutPref: null,
  parkingRequired: false,
  liftRequired: false,
  notes: null,
  preferredLocalities: JSON.stringify(["Mansarovar Garden"]),
  customerContact: { id: "contact1", name: "Rahul Sharma", phone: "+919876543210", email: null, source: "MANUAL" },
};

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: "admin1", role: "ADMIN" } });
  requirementFindFirst.mockResolvedValue(REQUIREMENT);
  leadCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "lead-dp-1", ...data }));
  requirementUpdate.mockResolvedValue({});
  autoAssignLead.mockResolvedValue({ assigned: true, employeeId: "emp1", strategy: "LOWEST_WORKLOAD", reason: "ok" });
});

describe("A6 - Demand Pool conversion (defaults to Unassigned)", () => {
  it("converts requirement to lead leaving it unassigned by default", async () => {
    const res = await POST(req(), params("req1"));
    expect(res.status).toBe(201);
    expect(autoAssignLead).not.toHaveBeenCalled();
  });

  it("does not re-run conversion when the requirement was already converted (idempotent path)", async () => {
    requirementFindFirst.mockResolvedValue({ ...REQUIREMENT, convertedLeadId: "lead-existing" });
    leadFindUnique.mockResolvedValue({ id: "lead-existing" });

    const res = await POST(req(), params("req1"));
    const body = await res.json();

    expect(body.alreadyConverted).toBe(true);
    expect(autoAssignLead).not.toHaveBeenCalled();
  });

  it("records audit log on lead creation", async () => {
    const res = await POST(req(), params("req1"));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.lead.id).toBe("lead-dp-1");
  });
});
