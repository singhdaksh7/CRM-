import { describe, it, expect } from "vitest";
import { DELETION_PLAN, DELETION_MODEL_KEYS } from "./deletion-plan";

function indexOf(model: string): number {
  return DELETION_MODEL_KEYS.indexOf(model as (typeof DELETION_MODEL_KEYS)[number]);
}

describe("DELETION_PLAN - dependency-safe ordering", () => {
  it("never includes propertyPortalConnection, organization, systemConfig, or user - those are handled outside this plan or never touched", () => {
    expect(DELETION_MODEL_KEYS).not.toContain("propertyPortalConnection");
    expect(DELETION_MODEL_KEYS).not.toContain("organization");
    expect(DELETION_MODEL_KEYS).not.toContain("systemConfig");
    expect(DELETION_MODEL_KEYS).not.toContain("user");
  });

  it("has no duplicate model entries", () => {
    expect(new Set(DELETION_MODEL_KEYS).size).toBe(DELETION_MODEL_KEYS.length);
  });

  it("deletes children before the parent for every required (non-cascade) FK found in the schema", () => {
    // Visit has required, non-cascade FKs into Lead and Property.
    expect(indexOf("visit")).toBeLessThan(indexOf("lead"));
    expect(indexOf("visit")).toBeLessThan(indexOf("property"));
    // VisitProperty has a required, non-cascade FK into Property.
    expect(indexOf("visitProperty")).toBeLessThan(indexOf("property"));
    // PropertyAvailabilityReport has required, non-cascade FKs into Property and PropertyImage.
    expect(indexOf("propertyAvailabilityReport")).toBeLessThan(indexOf("property"));
    expect(indexOf("propertyAvailabilityReport")).toBeLessThan(indexOf("propertyImage"));
    // PropertyReport / CatalogueShareProperty / CataloguePropertyPreference all require Property.
    expect(indexOf("propertyReport")).toBeLessThan(indexOf("property"));
    expect(indexOf("catalogueShareProperty")).toBeLessThan(indexOf("property"));
    expect(indexOf("cataloguePropertyPreference")).toBeLessThan(indexOf("property"));
    // RequirementBroadcastRecipient requires InventoryPartner.
    expect(indexOf("requirementBroadcastRecipient")).toBeLessThan(indexOf("inventoryPartner"));
    // CustomerRequirement.convertedLeadId / Lead.customerContactId chain: CustomerRequirement, then Lead, then CustomerContact.
    expect(indexOf("customerRequirement")).toBeLessThan(indexOf("lead"));
    expect(indexOf("lead")).toBeLessThan(indexOf("customerContact"));
    // Import records must be removed before their parent job.
    expect(indexOf("importRecord")).toBeLessThan(indexOf("importJob"));
    // RestoreValidation before its parent BackupRecord.
    expect(indexOf("restoreValidation")).toBeLessThan(indexOf("backupRecord"));
  });

  it("places property/lead deletion before Owner/InventoryPartner/PropertyLocality (their optional-FK parents)", () => {
    expect(indexOf("property")).toBeLessThan(indexOf("owner"));
    expect(indexOf("property")).toBeLessThan(indexOf("inventoryPartner"));
    expect(indexOf("property")).toBeLessThan(indexOf("propertyLocality"));
  });

  it("every step's where() is organizationId-scoped or resolves to an organizationId-scoped relation - never an unscoped filter", () => {
    for (const step of DELETION_PLAN) {
      const where = step.where("org_default") as Record<string, unknown>;
      const serialized = JSON.stringify(where);
      expect(where).not.toEqual({});
      expect(serialized).toContain("org_default");
    }
  });

  it("includes the Housing.com import tables (importJob/importRecord) - not conditioned on a specific ImportEntityType", () => {
    expect(DELETION_MODEL_KEYS).toContain("importJob");
    expect(DELETION_MODEL_KEYS).toContain("importRecord");
  });
});
