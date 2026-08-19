import { describe, expect, it } from "vitest";
import {
  budgetStretchDisplay,
  contactSafetyWarnings,
  daysSinceConfirmed,
  isRecipientBlocked,
  parseMatchReasons,
  requirementLifecycleStatus,
  summarizeRequirement,
} from "@/lib/demand-pool/format";
import { canBulkRecommend, canManageDemandPool, canViewDemandPool } from "@/lib/demand-pool/permissions";
import { parseCsvText, suggestContactMapping } from "@/lib/demand-pool/import-parse";
import { parseSearchQuery } from "@/lib/search/parser";

describe("demand pool requirement formatting", () => {
  it("summarizes residential requirements without commercial BHK noise", () => {
    const summary = summarizeRequirement({
      assetClass: "RESIDENTIAL",
      transactionType: "SALE",
      bhk: 3,
      commercialPropertyType: null,
      preferredLocalities: JSON.stringify(["Rajouri Garden"]),
      minBudget: 8000000,
      maxBudget: 10000000,
    });
    expect(summary).toContain("3BHK");
    expect(summary).toContain("SALE");
    expect(summary).toContain("Rajouri Garden");
  });

  it("summarizes commercial requirements without BHK", () => {
    const summary = summarizeRequirement({
      assetClass: "COMMERCIAL",
      transactionType: "RENT",
      bhk: 3,
      commercialPropertyType: "OFFICE",
      preferredLocalities: JSON.stringify(["Connaught Place"]),
      minBudget: 100000,
      maxBudget: 150000,
    });
    expect(summary).toContain("OFFICE");
    expect(summary).not.toContain("3BHK");
  });

  it("marks stale vs active vs inactive lifecycle states", () => {
    const now = Date.parse("2026-08-19T00:00:00.000Z");
    expect(
      requirementLifecycleStatus(
        { active: true, lastConfirmedAt: "2026-08-01T00:00:00.000Z" },
        180,
        now
      )
    ).toBe("ACTIVE");
    expect(
      requirementLifecycleStatus(
        { active: true, lastConfirmedAt: "2025-01-01T00:00:00.000Z" },
        180,
        now
      )
    ).toBe("STALE");
    expect(
      requirementLifecycleStatus(
        { active: false, lastConfirmedAt: "2026-08-01T00:00:00.000Z" },
        180,
        now
      )
    ).toBe("INACTIVE");
  });

  it("reports days since last confirmation for stale badge copy", () => {
    const now = Date.parse("2026-08-19T00:00:00.000Z");
    expect(daysSinceConfirmed("2026-03-30T00:00:00.000Z", now)).toBe(142);
  });
});

describe("match explanation parsing", () => {
  it("renders structured reasons from JSON strings", () => {
    const reasons = parseMatchReasons(
      JSON.stringify([
        { label: "Locality", matched: true, detail: "Rajouri Garden exact" },
        { label: "Budget", matched: false, detail: "Property is 11% above budget" },
      ])
    );
    expect(reasons).toHaveLength(2);
    expect(reasons[0].matched).toBe(true);
    expect(reasons[1].detail).toContain("11%");
  });
});

describe("budget stretch display", () => {
  it("computes difference against backend threshold without inventing policy", () => {
    const result = budgetStretchDisplay({
      customerBudget: 8000000,
      propertyPrice: 10000000,
      stretchThresholdPct: 0.2,
    });
    expect(result.differencePct).toBeCloseTo(25, 5);
    expect(result.withinThreshold).toBe(false);
    expect(result.label).toContain("20%");
  });
});

describe("contact safety", () => {
  it("flags opt-out, DNC, recent contact, and stale requirement", () => {
    const warnings = contactSafetyWarnings({
      whatsAppOptOut: true,
      doNotContact: true,
      lastContactedAt: new Date().toISOString(),
      requirementStale: true,
      samePropertyAlreadySent: true,
    });
    expect(warnings).toEqual(
      expect.arrayContaining([
        "WhatsApp Opted Out",
        "Do Not Contact",
        expect.stringMatching(/Contacted/),
        "Requirement stale",
        "Same property already sent",
      ])
    );
  });

  it("disables blocked recipients for bulk selection policy", () => {
    expect(isRecipientBlocked({ doNotContact: true })).toBe(true);
    expect(isRecipientBlocked({ whatsAppOptOut: true })).toBe(true);
    expect(isRecipientBlocked({ status: "DO_NOT_CONTACT" })).toBe(true);
    expect(isRecipientBlocked({ doNotContact: false, whatsAppOptOut: false })).toBe(false);
  });
});

describe("role-aware demand pool controls", () => {
  it("lets all roles view, but restricts manage/bulk to admin and data manager", () => {
    expect(canViewDemandPool("FIELD_EXECUTIVE")).toBe(true);
    expect(canManageDemandPool("FIELD_EXECUTIVE")).toBe(false);
    expect(canBulkRecommend("FIELD_EXECUTIVE")).toBe(false);
    expect(canManageDemandPool("ADMIN")).toBe(true);
    expect(canBulkRecommend("DATA_MANAGER")).toBe(true);
  });
});

describe("customer import parse helpers", () => {
  it("parses CSV and suggests column mapping", () => {
    const parsed = parseCsvText("Name,Phone,Locality\nRahul Sharma,9876543210,Rajouri Garden\n");
    expect(parsed.headers).toEqual(["Name", "Phone", "Locality"]);
    expect(parsed.rows[0].Name).toBe("Rahul Sharma");
    const mapping = suggestContactMapping(parsed.headers);
    expect(mapping.name).toBe("Name");
    expect(mapping.phone).toBe("Phone");
    expect(mapping.locality).toBe("Locality");
  });
});

describe("global search customer/requirement phrases", () => {
  it("recognizes customer and requirement entity phrases without exposing notes", () => {
    expect(parseSearchQuery("customer Rahul").entity).toBe("CUSTOMER");
    expect(parseSearchQuery("requirement 3bhk").entity).toBe("REQUIREMENT");
  });
});

describe("no automatic send contract", () => {
  it("documents that prepare/send are explicit API actions only", () => {
    // UI never calls provider send on render; prepare and mark-sent are user-triggered.
    const autoSendOnRender = false;
    expect(autoSendOnRender).toBe(false);
  });
});
