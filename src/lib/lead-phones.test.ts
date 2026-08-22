import { describe, it, expect, vi, beforeEach } from "vitest";

const leadFindFirst = vi.fn();
const leadPhoneFindFirst = vi.fn();
const leadPhoneFindMany = vi.fn();
const leadPhoneCreate = vi.fn();
const leadPhoneUpdateMany = vi.fn();
const leadPhoneDelete = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    lead: { findFirst: (...a: unknown[]) => leadFindFirst(...a) },
    leadPhone: {
      findFirst: (...a: unknown[]) => leadPhoneFindFirst(...a),
      findMany: (...a: unknown[]) => leadPhoneFindMany(...a),
      create: (...a: unknown[]) => leadPhoneCreate(...a),
      updateMany: (...a: unknown[]) => leadPhoneUpdateMany(...a),
      delete: (...a: unknown[]) => leadPhoneDelete(...a),
    },
  },
}));

// api-auth.ts transitively imports the full NextAuth stack, which fails to
// resolve in the vitest environment - mocked with a real Error subclass
// (same pattern used elsewhere, e.g. lead-access.test.ts).
vi.mock("./api-auth", () => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { ApiError: MockApiError };
});

import { addLeadPhone, deleteLeadPhone, getAllLeadPhoneNumbers, listLeadPhones, normalizeOrThrow } from "./lead-phones";
import { ApiError } from "./api-auth";

const ORG_A = "org_a";
const ORG_B = "org_b";

describe("normalizeOrThrow", () => {
  it("normalizes a valid 10-digit Indian mobile number", () => {
    expect(normalizeOrThrow("9876543210")).toBe("919876543210");
  });

  it("normalizes a number with a leading 0", () => {
    expect(normalizeOrThrow("09876543210")).toBe("919876543210");
  });

  it("rejects an invalid number", () => {
    expect(() => normalizeOrThrow("12345")).toThrow(ApiError);
  });
});

describe("addLeadPhone", () => {
  beforeEach(() => {
    leadFindFirst.mockReset();
    leadPhoneFindFirst.mockReset();
    leadPhoneCreate.mockReset();
    leadPhoneUpdateMany.mockReset();
  });

  it("404s when the lead does not exist in the caller's organization", async () => {
    leadFindFirst.mockResolvedValue(null);
    await expect(addLeadPhone({ organizationId: ORG_A, leadId: "lead_1", phone: "9876543210" })).rejects.toMatchObject({ status: 404 });
  });

  it("rejects adding a number that duplicates the lead's existing primary phone", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead_1", phone: "919876543210" });
    await expect(addLeadPhone({ organizationId: ORG_A, leadId: "lead_1", phone: "9876543210" })).rejects.toMatchObject({ status: 409 });
    expect(leadPhoneCreate).not.toHaveBeenCalled();
  });

  it("rejects adding a number already saved as an alternate for the same lead (per-lead dedupe)", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead_1", phone: "919999999999" });
    leadPhoneFindFirst.mockResolvedValue({ id: "existing", phone: "919876543210" });
    await expect(addLeadPhone({ organizationId: ORG_A, leadId: "lead_1", phone: "9876543210" })).rejects.toMatchObject({ status: 409 });
    expect(leadPhoneCreate).not.toHaveBeenCalled();
  });

  it("normalizes and creates a new alternate number scoped to the caller's organization", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead_1", phone: "919999999999" });
    leadPhoneFindFirst.mockResolvedValue(null);
    leadPhoneCreate.mockResolvedValue({ id: "phone_1", phone: "919876543210", type: "ALTERNATE" });

    await addLeadPhone({ organizationId: ORG_A, leadId: "lead_1", phone: "09876543210", label: "Spouse" });

    expect(leadPhoneCreate).toHaveBeenCalledWith({
      data: { organizationId: ORG_A, leadId: "lead_1", phone: "919876543210", type: "ALTERNATE", label: "Spouse", createdById: null },
    });
    // Never touches ORG_B rows - the lookup that would find a cross-lead
    // duplicate is always scoped by organizationId.
    expect(leadPhoneFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG_A }) }));
  });

  it("demotes an existing PRIMARY row rather than rejecting when a new PRIMARY is added", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead_1", phone: "919999999999" });
    leadPhoneFindFirst.mockResolvedValue(null);
    leadPhoneCreate.mockResolvedValue({ id: "phone_2", phone: "919876543210", type: "PRIMARY" });

    await addLeadPhone({ organizationId: ORG_A, leadId: "lead_1", phone: "9876543210", type: "PRIMARY" });

    expect(leadPhoneUpdateMany).toHaveBeenCalledWith({
      where: { organizationId: ORG_A, leadId: "lead_1", type: "PRIMARY" },
      data: { type: "ALTERNATE" },
    });
  });
});

describe("org isolation", () => {
  it("listLeadPhones only queries the caller's organization", async () => {
    leadPhoneFindMany.mockResolvedValue([]);
    await listLeadPhones(ORG_B, "lead_1");
    expect(leadPhoneFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: ORG_B, leadId: "lead_1" } }));
  });

  it("deleteLeadPhone 404s rather than deleting a row from a different organization", async () => {
    leadPhoneFindFirst.mockReset();
    leadPhoneFindFirst.mockResolvedValue(null);
    await expect(deleteLeadPhone(ORG_A, "lead_1", "phone_from_org_b")).rejects.toMatchObject({ status: 404 });
    expect(leadPhoneDelete).not.toHaveBeenCalled();
  });

  it("getAllLeadPhoneNumbers dedupes the legacy Lead.phone column against LeadPhone rows", async () => {
    leadFindFirst.mockResolvedValue({ phone: "919876543210" });
    leadPhoneFindMany.mockResolvedValue([{ phone: "919876543210" }, { phone: "911234567890" }]);
    const numbers = await getAllLeadPhoneNumbers(ORG_A, "lead_1");
    expect(numbers.sort()).toEqual(["911234567890", "919876543210"]);
  });
});
