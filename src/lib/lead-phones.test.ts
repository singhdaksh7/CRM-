import { describe, it, expect, vi, beforeEach } from "vitest";

const leadFindFirst = vi.fn();
const leadPhoneFindFirst = vi.fn();
const leadPhoneFindMany = vi.fn();
const leadPhoneCreate = vi.fn();
const leadPhoneUpdateMany = vi.fn();
const leadPhoneDelete = vi.fn();
// Real Prisma runs everything passed to $transaction([...]) as one atomic
// unit; Promise.all is a faithful-enough stand-in for these tests, which
// only assert WHAT was included in the transaction and that a failure
// inside it is caught/translated, not Postgres's actual isolation guarantee.
const transactionMock = vi.fn((ops: Promise<unknown>[]) => Promise.all(ops));

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
    $transaction: (...a: [Promise<unknown>[]]) => transactionMock(...a),
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
import { Prisma } from "@prisma/client";

const ORG_A = "org_a";
const ORG_B = "org_b";

function p2002(target?: string | string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test", meta: target !== undefined ? { target } : undefined });
}

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
    transactionMock.mockClear();
    transactionMock.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
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

  it("normalizes and creates a new alternate number scoped to the caller's organization, via a transaction", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead_1", phone: "919999999999" });
    leadPhoneCreate.mockResolvedValue({ id: "phone_1", phone: "919876543210", type: "ALTERNATE" });

    const result = await addLeadPhone({ organizationId: ORG_A, leadId: "lead_1", phone: "09876543210", label: "Spouse" });

    expect(leadPhoneCreate).toHaveBeenCalledWith({
      data: { organizationId: ORG_A, leadId: "lead_1", phone: "919876543210", type: "ALTERNATE", label: "Spouse", createdById: null },
    });
    // Adding a plain ALTERNATE never touches the existing PRIMARY row.
    expect(leadPhoneUpdateMany).not.toHaveBeenCalled();
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: "phone_1", phone: "919876543210", type: "ALTERNATE" });
  });

  it("demotes an existing PRIMARY row and creates the new one in the SAME transaction (Correctness issue C)", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead_1", phone: "919999999999" });
    leadPhoneCreate.mockResolvedValue({ id: "phone_2", phone: "919876543210", type: "PRIMARY" });

    await addLeadPhone({ organizationId: ORG_A, leadId: "lead_1", phone: "9876543210", type: "PRIMARY" });

    expect(leadPhoneUpdateMany).toHaveBeenCalledWith({
      where: { organizationId: ORG_A, leadId: "lead_1", type: "PRIMARY" },
      data: { type: "ALTERNATE" },
    });
    // Both the demote and the create were handed to $transaction as ONE
    // array - not two separate awaited calls - which is what actually closes
    // the concurrent-primary race: whichever request's transaction commits
    // second sees the first one's already-demoted row.
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(transactionMock.mock.calls[0][0]).toHaveLength(2);
  });

  it("converts a concurrent duplicate-number race (DB unique constraint violation) into a clean 409, not a 500", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead_1", phone: "919999999999" });
    // Simulates two requests racing past any in-process check and both
    // reaching the database - the DB's own unique constraint is what
    // actually prevents the duplicate row, surfaced here as Prisma's P2002.
    transactionMock.mockRejectedValueOnce(p2002(["organizationId", "leadId", "phone"]));

    await expect(addLeadPhone({ organizationId: ORG_A, leadId: "lead_1", phone: "9876543210" })).rejects.toMatchObject({ status: 409, message: "This number is already saved for this lead" });
  });

  // Blocker 3 (correctness issue C follow-up) - the $transaction demote-then
  // -create alone does not prevent two concurrent "make primary" requests
  // from both reaching the INSERT under READ COMMITTED (see the long
  // comment in this function and in schema.prisma's LeadPhone doc comment).
  // The lead_phones_one_primary_per_lead partial unique index
  // (prisma/migrations/20260822120000_.../migration.sql) is the actual
  // backstop; this proves the losing request gets a clean, distinct 409
  // rather than either a 500 or being misreported as a duplicate-NUMBER
  // conflict. True concurrent-transaction behavior against a real Postgres
  // instance is not exercised here - see this file's transactionMock
  // comment - this test only proves the P2002-classification contract:
  // given a P2002 whose meta.target names the partial index, the caller is
  // told specifically "someone else just made a number primary", not a
  // generic duplicate-number message.
  it("converts a concurrent PRIMARY conflict (partial unique index violation) into a distinct clean 409, not the duplicate-number message", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead_1", phone: "919999999999" });
    transactionMock.mockRejectedValueOnce(p2002("lead_phones_one_primary_per_lead"));

    let caught: unknown;
    try {
      await addLeadPhone({ organizationId: ORG_A, leadId: "lead_1", phone: "9876543210", type: "PRIMARY" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as ApiError).status).toBe(409);
    expect((caught as Error).message).toMatch(/just marked primary/);
  });

  it("still returns a clean 409 for a PRIMARY conflict even when Prisma can't resolve the target (defaults to the duplicate-number message rather than a 500)", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead_1", phone: "919999999999" });
    transactionMock.mockRejectedValueOnce(p2002());

    await expect(addLeadPhone({ organizationId: ORG_A, leadId: "lead_1", phone: "9876543210", type: "PRIMARY" })).rejects.toMatchObject({ status: 409 });
  });

  it("re-throws a non-conflict database error rather than misreporting it as a duplicate", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead_1", phone: "919999999999" });
    transactionMock.mockRejectedValueOnce(new Error("connection reset"));

    await expect(addLeadPhone({ organizationId: ORG_A, leadId: "lead_1", phone: "9876543210" })).rejects.toThrow("connection reset");
  });
});

describe("org isolation", () => {
  it("listLeadPhones only queries the caller's organization", async () => {
    leadPhoneFindMany.mockResolvedValue([]);
    await listLeadPhones(ORG_B, "lead_1");
    expect(leadPhoneFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: ORG_B, leadId: "lead_1" } }));
  });

  it("addLeadPhone's own-organization lead lookup never crosses into another organization", async () => {
    leadFindFirst.mockResolvedValue(null);
    await expect(addLeadPhone({ organizationId: ORG_A, leadId: "lead_1", phone: "9876543210" })).rejects.toMatchObject({ status: 404 });
    expect(leadFindFirst).toHaveBeenCalledWith({ where: { id: "lead_1", organizationId: ORG_A }, select: { id: true, phone: true } });
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
