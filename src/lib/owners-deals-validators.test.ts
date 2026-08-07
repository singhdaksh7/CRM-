import { describe, it, expect } from "vitest";
import {
  ownerSchema,
  ownerVerificationSchema,
  dealSchema,
  dealStageUpdateSchema,
  brokerageCalculationSchema,
  paymentSchema,
  documentMetadataSchema,
  createImportJobSchema,
} from "./validators";

describe("ownerSchema", () => {
  it("accepts a minimal valid owner", () => {
    const result = ownerSchema.safeParse({ name: "Ramesh Gupta", phone: "9876543210" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing phone", () => {
    const result = ownerSchema.safeParse({ name: "Ramesh Gupta" });
    expect(result.success).toBe(false);
  });

  it("rejects a name shorter than 2 characters", () => {
    const result = ownerSchema.safeParse({ name: "R", phone: "9876543210" });
    expect(result.success).toBe(false);
  });
});

describe("ownerVerificationSchema", () => {
  it("accepts a known verification status", () => {
    expect(ownerVerificationSchema.safeParse({ verificationStatus: "VERIFIED" }).success).toBe(true);
  });

  it("rejects an unknown verification status", () => {
    expect(ownerVerificationSchema.safeParse({ verificationStatus: "TRUSTED" }).success).toBe(false);
  });
});

describe("dealSchema", () => {
  it("accepts a minimal valid deal", () => {
    expect(dealSchema.safeParse({ dealType: "RENTAL" }).success).toBe(true);
  });

  it("rejects an invalid dealType", () => {
    expect(dealSchema.safeParse({ dealType: "LEASE" }).success).toBe(false);
  });

  it("rejects a negative agreedAmount", () => {
    expect(dealSchema.safeParse({ dealType: "SALE", agreedAmount: -1000 }).success).toBe(false);
  });
});

describe("dealStageUpdateSchema", () => {
  it("accepts a valid stage transition", () => {
    expect(dealStageUpdateSchema.safeParse({ stage: "NEGOTIATION" }).success).toBe(true);
  });

  it("rejects an unknown stage", () => {
    expect(dealStageUpdateSchema.safeParse({ stage: "PENDING" }).success).toBe(false);
  });

  it("requires complete commercial closure details for CLOSED_WON", () => {
    expect(dealStageUpdateSchema.safeParse({ stage: "CLOSED_WON" }).success).toBe(false);
    expect(dealStageUpdateSchema.safeParse({
      stage: "CLOSED_WON", agreedAmount: 45000, closingDate: "2026-08-07",
      closingNotes: "Agreement signed", expectedBrokerageAmount: 45000, kpSharePct: 100,
    }).success).toBe(true);
  });

  it("rejects invalid closure percentages and dates", () => {
    expect(dealStageUpdateSchema.safeParse({ stage: "CLOSED_WON", agreedAmount: 1, closingDate: "today", closingNotes: "x", expectedBrokerageAmount: 0, kpSharePct: 101 }).success).toBe(false);
  });
});

describe("brokerageCalculationSchema", () => {
  it("accepts a valid rental calculation input", () => {
    const result = brokerageCalculationSchema.safeParse({ type: "RENTAL", baseAmount: 20000, brokeragePct: 100 });
    expect(result.success).toBe(true);
  });

  it("rejects a percentage over 100", () => {
    expect(brokerageCalculationSchema.safeParse({ type: "SALE", baseAmount: 100000, brokeragePct: 150 }).success).toBe(false);
  });

  it("rejects a non-positive baseAmount", () => {
    expect(brokerageCalculationSchema.safeParse({ type: "SALE", baseAmount: 0 }).success).toBe(false);
  });
});

describe("paymentSchema", () => {
  it("defaults direction/method/status", () => {
    const result = paymentSchema.parse({ amount: 5000 });
    expect(result.direction).toBe("RECEIVABLE");
    expect(result.method).toBe("CASH");
    expect(result.status).toBe("PENDING");
  });

  it("rejects a non-positive amount", () => {
    expect(paymentSchema.safeParse({ amount: 0 }).success).toBe(false);
  });
});

describe("documentMetadataSchema", () => {
  it("accepts a valid property document", () => {
    const result = documentMetadataSchema.safeParse({
      entityType: "PROPERTY",
      propertyId: "prop_1",
      fileName: "title-deed.pdf",
      fileUrl: "https://storage.example.com/title-deed.pdf",
      fileType: "application/pdf",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown entityType", () => {
    const result = documentMetadataSchema.safeParse({
      entityType: "VISIT",
      fileName: "note.pdf",
      fileUrl: "https://storage.example.com/note.pdf",
      fileType: "application/pdf",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing fileUrl", () => {
    const result = documentMetadataSchema.safeParse({ entityType: "OWNER", ownerId: "own_1", fileName: "id.pdf", fileType: "application/pdf" });
    expect(result.success).toBe(false);
  });
});

describe("createImportJobSchema", () => {
  it("accepts a valid owners import job", () => {
    const result = createImportJobSchema.safeParse({
      entityType: "OWNERS",
      fileName: "owners.csv",
      rows: [{ Name: "Ramesh Gupta", Phone: "9876543210" }],
      columnMapping: { name: "Name", phone: "Phone" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty rows array", () => {
    const result = createImportJobSchema.safeParse({
      entityType: "OWNERS",
      fileName: "owners.csv",
      rows: [],
      columnMapping: { name: "Name" },
    });
    expect(result.success).toBe(false);
  });
});
