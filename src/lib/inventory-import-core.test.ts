import { describe, expect, it } from "vitest";
import {
  classifyDuplicate, defaultImportAction, errorsToCsv, fieldDiff, headerSignature, normalizeMappedRow, parseArea, parseBoolean,
  parseFloor, parseInventorySource, parseMoney, protectCsvCell, suggestColumnMapping, validateImportedProperty,
} from "./inventory-import-core";

describe("inventory import header mapping", () => {
  it("auto-maps common business aliases independent of order", () => {
    const result = suggestColumnMapping(["Owner No", "Square Feet", "Location", "DIR/IND", "Possession"]);
    expect(result.mapping).toMatchObject({ ownerPhone: "Owner No", builtUpAreaSqft: "Square Feet", area: "Location", inventorySource: "DIR/IND", possessionNotes: "Possession" });
  });
  it("leaves ambiguous aliases for employee review", () => {
    const result = suggestColumnMapping(["Location", "Locality"]);
    expect(result.mapping.area).toBeUndefined(); expect(result.ambiguous.area).toEqual(["Location", "Locality"]);
  });
  it("manual mapping can override suggestions", () => {
    const { data } = normalizeMappedRow({ Location: "Janakpuri", Custom: "Dwarka" }, { area: "Custom" });
    expect(data.area).toBe("Dwarka");
  });
  it("creates order-insensitive signatures for presets", () => expect(headerSignature(["Owner No", "Location"])).toBe(headerSignature(["location", "owner-no"])));
});

describe("inventory value normalization", () => {
  it.each([["DIR", "DIRECT"], ["Direct", "DIRECT"], ["DIRECT", "DIRECT"], ["IND", "INDIRECT"], ["Indirect", "INDIRECT"]])("normalizes source %s", (raw, expected) => expect(parseInventorySource(raw)).toBe(expected));
  it("does not guess an unknown inventory source", () => expect(parseInventorySource("owner maybe")).toBeNull());
  it.each([["₹25,000", 25000], ["25000", 25000], ["25k", 25000], ["1.25 lakh", 125000], ["1.2cr", 12000000]])("normalizes price %s", (raw, expected) => expect(parseMoney(raw)).toBe(expected));
  it.each(["about 25k", "25-30k", "market price", ""])('rejects ambiguous price "%s"', (raw) => expect(parseMoney(raw)).toBeNull());
  it.each([["850 sq ft", 850], ["850 sqft", 850], ["850", 850]])("normalizes area %s", (raw, expected) => expect(parseArea(raw)).toBe(expected));
  it.each([["2nd Floor", 2], ["Second Floor", 2], ["2", 2], ["Ground Floor", 0], ["Basement", -1]])("normalizes floor %s", (raw, expected) => expect(parseFloor(raw)).toBe(expected));
  it.each([["Yes", true], ["Y", true], ["Available", true], ["No", false], ["N", false]])("normalizes boolean %s", (raw, expected) => expect(parseBoolean(raw)).toBe(expected));
  it("splits a combined parking/lift column", () => { const { data } = normalizeMappedRow({ facilities: "Parking + Lift" }, { parkingLift: "facilities" }); expect(data).toMatchObject({ parkingAvailable: true, liftAvailable: true }); });
  it("normalizes RTM possession without inventing a date", () => { const { data } = normalizeMappedRow({ p: "RTM" }, { possessionNotes: "p" }); expect(data.possessionNotes).toBe("Ready to Move"); expect(data.availableFrom).toBeUndefined(); });
});

describe("inventory row validation", () => {
  const valid = { title: "Two bedroom apartment", propertyType: "APARTMENT", listingType: "RENT", inventorySource: "DIRECT", area: "Janakpuri", address: "F Block near metro", monthlyRent: 25000, bhk: 2, bathrooms: 2, furnishing: "SEMI_FURNISHED", builtUpAreaSqft: 850, ownerName: "Ravi Kumar", ownerPhone: "919876543210" };
  it("accepts a complete direct property", () => expect(validateImportedProperty(valid, [])).toEqual([]));
  it("reports required fields individually", () => { const issues = validateImportedProperty({}, []); expect(issues.some((i) => i.field === "title")).toBe(true); expect(issues.some((i) => i.field === "area")).toBe(true); });
  it("requires owner details for direct inventory", () => expect(validateImportedProperty({ ...valid, ownerName: undefined }, []).some((i) => i.message.includes("Owner name"))).toBe(true));
  it("requires a partner for indirect inventory", () => expect(validateImportedProperty({ ...valid, inventorySource: "INDIRECT", ownerName: undefined, ownerPhone: undefined }, []).some((i) => i.field === "partnerId")).toBe(true));
  it("returns a field-specific invalid phone issue", () => { const result = normalizeMappedRow({ phone: "98ABC123" }, { ownerPhone: "phone" }); expect(result.issues[0]).toMatchObject({ field: "ownerPhone", originalValue: "98ABC123" }); });
  it("returns pincode and enum errors by field", () => { const issues = validateImportedProperty({ ...valid, pincode: "1100", status: "BROKEN" }, []); expect(issues.map((i) => i.field)).toEqual(expect.arrayContaining(["pincode", "status"])); });
});

describe("duplicate classification and resolution", () => {
  const existing = [{ id: "p1", propertyCode: "PROP-1", title: "Flat", area: "Janakpuri", address: "F Block 10", floorNumber: 2, builtUpAreaSqft: 850, monthlyRent: 25000, salePrice: null, bhk: 2, ownerPhone: "919876543210" }];
  it("classifies same property code as exact", () => expect(classifyDuplicate({ propertyCode: "PROP-1" }, existing).duplicateClass).toBe("EXACT_DUPLICATE"));
  it("classifies owner phone plus exact address as exact", () => expect(classifyDuplicate({ ownerPhone: "919876543210", area: "Janakpuri", address: "F Block 10" }, existing).duplicateClass).toBe("EXACT_DUPLICATE"));
  it("classifies medium-signal combinations as probable", () => expect(classifyDuplicate({ ownerPhone: "919876543210", area: "Dwarka" }, existing).duplicateClass).toBe("PROBABLE_DUPLICATE"));
  it("classifies locality plus area as possible", () => expect(classifyDuplicate({ area: "Janakpuri", builtUpAreaSqft: 850 }, existing).duplicateClass).toBe("POSSIBLE_DUPLICATE"));
  it("never auto-updates on weak locality and price alone", () => { const duplicate = classifyDuplicate({ area: "Janakpuri", monthlyRent: 25000 }, existing).duplicateClass; expect(duplicate).toBe("POSSIBLE_DUPLICATE"); expect(defaultImportAction("UPSERT_SAFE", duplicate)).toBe("SKIP"); });
  it("classifies unrelated inventory as new", () => expect(classifyDuplicate({ area: "Rohini", monthlyRent: 31000 }, existing).duplicateClass).toBe("NEW"));
  it.each([
    ["CREATE_ONLY", "EXACT_DUPLICATE", "SKIP"], ["CREATE_ONLY", "NEW", "CREATE"], ["UPSERT_SAFE", "EXACT_DUPLICATE", "UPDATE_EXISTING"],
    ["UPSERT_SAFE", "PROBABLE_DUPLICATE", "SKIP"], ["UPDATE_EXISTING_ONLY", "NEW", "SKIP"], ["UPDATE_EXISTING_ONLY", "EXACT_DUPLICATE", "UPDATE_EXISTING"],
  ] as const)("uses safe default %s/%s", (mode, duplicate, expected) => expect(defaultImportAction(mode, duplicate)).toBe(expected));
  it("shows field diffs and preserves blank CRM fields by default", () => { const diff = fieldDiff(existing[0], { monthlyRent: 27000, title: "" }); expect(diff).toEqual([{ field: "monthlyRent", before: 25000, after: 27000 }]); });
  it("includes explicit blank clearing in diff", () => expect(fieldDiff(existing[0], { title: "" }, true)).toEqual([{ field: "title", before: "Flat", after: "" }]));
});

describe("safe error CSV", () => {
  it.each(["=SUM(A1:A2)", "+cmd", "-2+3", "@evil", "\tformula", "\rformula"])("neutralizes formula prefix %j", (value) => expect(protectCsvCell(value)).toContain("'"));
  it("quotes commas and double quotes", () => expect(protectCsvCell('a,"b"')).toBe('"a,""b"""'));
  it("exports one row per field error", () => { const csv = errorsToCsv([{ rowNumber: 18, issues: [{ field: "ownerPhone", originalValue: "98ABC123", message: "Invalid phone", severity: "ERROR" }] }]); expect(csv).toContain('"18","ownerPhone","98ABC123","Invalid phone"'); });
});
