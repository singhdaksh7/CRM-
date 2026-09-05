import { describe, expect, it } from "vitest";
import {
  applyImportFallbackDefaults, applySheetDefaults, classifyDuplicate, defaultImportAction, deriveSheetContext, errorsToCsv, fieldDiff, headerSignature, normalizeMappedRow, parseArea, parseAreaDetailed, parseBoolean,
  parseFloor, parseFloorDetailed, parseInventorySource, parseMoney, parseParkingLift, parsePriceDetailed, parseSourceDetailed, protectCsvCell, suggestColumnMapping, validateImportedProperty,
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
  // Property Inventory V2: 55% of the real KP workbook is DIRECT with no
  // owner on file yet (see validators.ts importCreatePropertySchema) - a
  // missing owner is no longer a hard validation ERROR for import, only a
  // WARNING surfaced by applyImportFallbackDefaults (tested separately
  // below). Manual create/edit (createPropertySchema) is unchanged and still
  // enforces this - see property-form/property API route tests.
  it("no longer hard-requires owner details for direct inventory on import", () => expect(validateImportedProperty({ ...valid, ownerName: undefined }, []).some((i) => i.message.includes("Owner name"))).toBe(false));
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

describe("parsePriceDetailed", () => {
  it.each([
    ["50 L", 5_000_000, null], ["50L", 5_000_000, null], ["50 L ASK", 5_000_000, null], ["85L", 8_500_000, null],
    ["1CR", 10_000_000, null], ["1.2CR", 12_000_000, null], ["1.25CR", 12_500_000, null], ["2.5CR ASK", 25_000_000, null],
    ["3.65 CR", 36_500_000, null], ["5.50 CR", 55_000_000, null], ["14.5CR", 145_000_000, null],
  ])("confidently parses %s", (raw, amount) => {
    const result = parsePriceDetailed(raw);
    expect(result.amount).toBe(amount); expect(result.ambiguous).toBe(false); expect(result.raw).toBe(raw);
  });
  it("extracts an exact last-price parenthetical alongside the main amount", () => {
    const result = parsePriceDetailed("4.6CR ASK (4.5CR LAST)");
    expect(result.amount).toBe(46_000_000); expect(result.lastPrice).toBe(45_000_000); expect(result.raw).toBe("4.6CR ASK (4.5CR LAST)"); expect(result.ambiguous).toBe(false);
  });
  it.each(["13.5CR ASK ( CHEQUE 7+ )", "13.75CR ASK LIFT PARKING"])("ignores trailing garbage without extracting a last price from %s", (raw) => {
    const result = parsePriceDetailed(raw);
    expect(result.lastPrice).toBeNull(); expect(result.ambiguous).toBe(false); expect(result.amount).toBeGreaterThan(0);
  });
  it("never guesses a unit for a bare amount", () => {
    const result = parsePriceDetailed("40 ASK");
    expect(result.amount).toBeNull(); expect(result.ambiguous).toBe(true); expect(result.raw).toBe("40 ASK");
  });
  it("treats a whitespace-only cell identically to blank", () => {
    expect(parsePriceDetailed("   ")).toEqual({ amount: null, raw: null, lastPrice: null, ambiguous: false });
  });
});

describe("parseAreaDetailed", () => {
  it.each([["1800", 1800], ["1800 SQ FT", 1800], ["87 Sq. ft", 87]])("confidently parses %s as SQ_FT", (raw, sqft) => {
    const result = parseAreaDetailed(raw);
    expect(result).toMatchObject({ sqft, unit: "SQ_FT", ambiguous: false });
  });
  it.each([["272 SQUARE YARDS", 2448], ["200GAJ", 1800], ["100 GAJ", 900]])("converts %s to sqft via SQ_YD x9 with a unit flag", (raw, sqft) => {
    const result = parseAreaDetailed(raw);
    expect(result).toMatchObject({ sqft, unit: "SQ_YD", ambiguous: false, raw });
  });
  it("never averages or picks a side of an ambiguous area range", () => {
    const result = parseAreaDetailed("87Sq.ft to 600Sq.ft");
    expect(result).toMatchObject({ sqft: null, unit: "OTHER", ambiguous: true });
  });
  it("flags dimension-shaped text found in an area field", () => {
    const result = parseAreaDetailed("10 X 20");
    expect(result).toMatchObject({ sqft: null, unit: "OTHER", ambiguous: true });
  });
  it("is confident SQ_FT for a bare number on a residential sheet (or no context)", () => {
    expect(parseAreaDetailed("1200", { sheetAssetClass: "RESIDENTIAL" })).toMatchObject({ sqft: 1200, unit: "SQ_FT", ambiguous: false });
    expect(parseAreaDetailed("1200")).toMatchObject({ sqft: 1200, unit: "SQ_FT", ambiguous: false });
  });
  it("is ambiguous for a bare number on a commercial sheet context", () => {
    expect(parseAreaDetailed("1200", { sheetAssetClass: "COMMERCIAL" })).toMatchObject({ sqft: null, unit: "OTHER", ambiguous: true });
  });
  it("treats a whitespace-only cell identically to blank", () => {
    expect(parseAreaDetailed("   ")).toEqual({ sqft: null, unit: "SQ_FT", raw: null, ambiguous: false });
  });
});

describe("parseFloorDetailed", () => {
  it.each([["GROUND", 0], ["2 ND", 2]])("recognizes %s", (raw, floorNumber) => expect(parseFloorDetailed(raw)).toEqual({ floorNumber, raw }));
  it("extracts the leading ordinal and ignores a trailing parenthetical annotation", () => {
    expect(parseFloorDetailed("2 ND(Square pattern/2 room)")).toEqual({ floorNumber: 2, raw: "2 ND(Square pattern/2 room)" });
  });
  it("extracts the leading ordinal and ignores trailing free text", () => {
    expect(parseFloorDetailed("3 RD WITH ROOF")).toEqual({ floorNumber: 3, raw: "3 RD WITH ROOF" });
  });
  it.each(["1 ST& 2 ND", "1ST & 2ND"])("never picks a side of a multi-floor combo %s", (raw) => {
    expect(parseFloorDetailed(raw)).toEqual({ floorNumber: null, raw });
  });
  it("leaves an unrecognized token unset while preserving raw", () => {
    expect(parseFloorDetailed("UG FLOOR")).toEqual({ floorNumber: null, raw: "UG FLOOR" });
  });
  it("treats a whitespace-only cell identically to blank", () => expect(parseFloorDetailed("   ")).toEqual({ floorNumber: null, raw: null }));
});

describe("parseSourceDetailed", () => {
  it.each([["DIRECT", "DIRECT"], ["dir", "DIRECT"], ["INDIRECT", "INDIRECT"], ["ind", "INDIRECT"]])("confidently classifies %s", (raw, expected) => {
    expect(parseSourceDetailed(raw)).toEqual({ inventorySource: expected, sourceRaw: raw, confident: true });
  });
  it.each(["NANAK", "BAWA SIR NE DIYA HAI"])("preserves unrecognized text as raw without confidently classifying %s", (raw) => {
    const result = parseSourceDetailed(raw);
    expect(result.confident).toBe(false); expect(result.sourceRaw).toBe(raw); expect(result.inventorySource).toBe("DIRECT");
  });
  it("treats a whitespace-only cell identically to blank", () => expect(parseSourceDetailed("   ")).toEqual({ inventorySource: "DIRECT", sourceRaw: null, confident: false }));
});

describe("parseParkingLift truth table", () => {
  it.each([
    ["WITH LIFT", true, null], ["ONLY LIFT", true, false], ["SCOOTY PARKING", null, true],
    ["LIFT(OPEN PARKING)", true, true],
  ] as const)("%s -> lift=%s parking=%s", (raw, lift, parking) => expect(parseParkingLift(raw)).toEqual({ lift, parking }));
  it("REGRESSION: negation-aware parsing never lets a bare /lift/ match override an explicit negation", () => {
    expect(parseParkingLift("WITHOUT LIFT WITH PARKING")).toEqual({ lift: false, parking: true });
  });
  it("gives no signal for an empty cell", () => expect(parseParkingLift("   ")).toEqual({ lift: null, parking: null }));
});

describe("phone splitting", () => {
  it("splits a slash-separated pair into primary and alternate", () => {
    const { data } = normalizeMappedRow({ phone: "9871467686/9212300000" }, { ownerPhone: "phone" });
    expect(data.ownerPhone).toBe("919871467686"); expect(data.ownerAlternatePhone).toBe("919212300000");
  });
  it("leaves a single international-format number unaffected", () => {
    const { data } = normalizeMappedRow({ phone: "+91 98733 33253" }, { ownerPhone: "phone" });
    expect(data.ownerPhone).toBe("919873333253"); expect(data.ownerAlternatePhone).toBeUndefined();
  });
  it("never overwrites an alternate phone already mapped from its own column", () => {
    const { data } = normalizeMappedRow({ phone: "9871467686/9212300000", alt: "9988776655" }, { ownerPhone: "phone", ownerAlternatePhone: "alt" });
    expect(data.ownerAlternatePhone).toBe("919988776655");
  });
  it("drops an invalid second token with a warning, keeping the primary phone", () => {
    const { data, issues } = normalizeMappedRow({ phone: "9871467686/123" }, { ownerPhone: "phone" });
    expect(data.ownerPhone).toBe("919871467686"); expect(data.ownerAlternatePhone).toBeUndefined();
    expect(issues.some((issue) => issue.field === "ownerAlternatePhone" && issue.severity === "WARNING")).toBe(true);
  });
});

describe("deriveSheetContext / applySheetDefaults", () => {
  it.each([["1 BHK SALE", 1, "SALE"], ["2BHK SALE", 2, "SALE"], ["3BHK SALE", 3, "SALE"], ["4BHK SALE", 4, "SALE"], ["5BHK SALE", 5, "SALE"]] as const)(
    "derives RESIDENTIAL bhk=%s listingType=%s from %s", (sheetName, bhk, listingType) => {
      expect(deriveSheetContext(sheetName)).toMatchObject({ assetClass: "RESIDENTIAL", bhk, listingType });
    });
  it("derives COMMERCIAL + COMMERCIAL_SHOP from a trailing-space commercial-shop sheet name", () => {
    expect(deriveSheetContext("COMERCIAL SHOP ")).toMatchObject({ assetClass: "COMMERCIAL", propertyType: "COMMERCIAL_SHOP" });
  });
  it("strips the _x0009_ tab artifact and derives PLOT", () => {
    expect(deriveSheetContext("PLOT FOR SALE_x0009_")).toMatchObject({ propertyType: "PLOT", assetClass: "RESIDENTIAL" });
  });
  it("checks both tab name and in-sheet title for LEASE (confirmed mismatch case)", () => {
    expect(deriveSheetContext("LEASE FOR SALE", "FLOOR FOR LEASE")).toMatchObject({ listingType: "RENT" });
    expect(deriveSheetContext("LEASE FOR SALE", "FLOOR FOR LEASE").bhk).toBeUndefined();
  });
  it("never guesses on an unrecognized sheet name", () => expect(deriveSheetContext("MISC TAB 7")).toEqual({}));
  it("applySheetDefaults fills only absent fields", () => {
    const context = deriveSheetContext("2BHK SALE");
    expect(applySheetDefaults({}, context)).toMatchObject({ assetClass: "RESIDENTIAL", bhk: 2, listingType: "SALE" });
  });
  it("an explicit per-row value always wins over the sheet-derived default", () => {
    const context = deriveSheetContext("2BHK SALE");
    expect(applySheetDefaults({ bhk: 4 }, context).bhk).toBe(4);
  });
});

describe("duplicate classification ignores new provenance fields", () => {
  const existing = [{ id: "p1", propertyCode: "PROP-1", title: "Flat", area: "Janakpuri", address: "F Block 10", floorNumber: 2, builtUpAreaSqft: 850, monthlyRent: 25000, salePrice: null, bhk: 2, ownerPhone: "919876543210" }];
  it("classifies identically whether or not areaUnit/areaRaw/floorRaw/priceRaw/sourceRaw are present", () => {
    const base = { ownerPhone: "919876543210", area: "Janakpuri", address: "F Block 10" };
    const withProvenance = { ...base, areaUnit: "SQ_YD", areaRaw: "94 sq yd", floorRaw: "2ND", priceRaw: "25k", sourceRaw: "DIR" };
    expect(classifyDuplicate(base, existing).duplicateClass).toBe(classifyDuplicate(withProvenance, existing).duplicateClass);
    expect(classifyDuplicate(withProvenance, existing).duplicateClass).toBe("EXACT_DUPLICATE");
  });
});

describe("applyImportFallbackDefaults", () => {
  it("defaults propertyType to OTHER for residential when undeterminable, with a WARNING", () => {
    const { propertyType } = applyImportFallbackDefaults({ assetClass: "RESIDENTIAL" }, []) as { propertyType: string };
    const issues: import("./inventory-import-core").ImportFieldIssue[] = [];
    applyImportFallbackDefaults({ assetClass: "RESIDENTIAL" }, issues);
    expect(propertyType).toBe("OTHER");
    expect(issues).toContainEqual(expect.objectContaining({ field: "propertyType", severity: "WARNING" }));
  });
  it("defaults propertyType to OTHER_COMMERCIAL for commercial when undeterminable", () => {
    const data = applyImportFallbackDefaults({ assetClass: "COMMERCIAL" }, []) as { propertyType: string };
    expect(data.propertyType).toBe("OTHER_COMMERCIAL");
  });
  it("never overrides a propertyType already set by the sheet or the row", () => {
    const data = applyImportFallbackDefaults({ assetClass: "COMMERCIAL", propertyType: "COMMERCIAL_SHOP" }, []) as { propertyType: string };
    expect(data.propertyType).toBe("COMMERCIAL_SHOP");
  });
  it("auto-generates a title from bhk+area when none is present, with a WARNING", () => {
    const issues: import("./inventory-import-core").ImportFieldIssue[] = [];
    const data = applyImportFallbackDefaults({ bhk: 3, area: "Rajouri Garden" }, issues) as { title: string };
    expect(data.title).toBe("3 BHK in Rajouri Garden");
    expect(issues).toContainEqual(expect.objectContaining({ field: "title", severity: "WARNING" }));
  });
  it("never overrides an explicit title", () => {
    const data = applyImportFallbackDefaults({ title: "Two bedroom apartment", bhk: 2 }, []) as { title: string };
    expect(data.title).toBe("Two bedroom apartment");
  });
  it("flags (WARNING, not ERROR) a DIRECT row with no owner on file", () => {
    const issues: import("./inventory-import-core").ImportFieldIssue[] = [];
    applyImportFallbackDefaults({ inventorySource: "DIRECT" }, issues);
    expect(issues).toContainEqual(expect.objectContaining({ field: "ownerName", severity: "WARNING" }));
  });
  it("does not flag a DIRECT row that already has owner name and phone", () => {
    const issues: import("./inventory-import-core").ImportFieldIssue[] = [];
    applyImportFallbackDefaults({ inventorySource: "DIRECT", ownerName: "Ravi Kumar", ownerPhone: "919876543210" }, issues);
    expect(issues.some((i) => i.field === "ownerName")).toBe(false);
  });
  it("does not flag an INDIRECT row for missing owner", () => {
    const issues: import("./inventory-import-core").ImportFieldIssue[] = [];
    applyImportFallbackDefaults({ inventorySource: "INDIRECT" }, issues);
    expect(issues.some((i) => i.field === "ownerName")).toBe(false);
  });
});

describe("status/bhk import parsing gaps found via real-workbook dry run", () => {
  it("maps a literal 'NOT AVAILABLE' status to INACTIVE", () => {
    const { data, issues } = normalizeMappedRow({ status: "NOT AVAILABLE" }, { status: "status" });
    expect(data.status).toBe("INACTIVE");
    expect(issues.some((i) => i.field === "status")).toBe(false);
  });
  it("parses a BHK column value like '1BHK' (not a bare number)", () => {
    const { data, issues } = normalizeMappedRow({ bhk: "1BHK" }, { bhk: "bhk" });
    expect(data.bhk).toBe(1);
    expect(issues.some((i) => i.field === "bhk")).toBe(false);
  });
  it("still parses a bare numeric BHK value", () => {
    const { data } = normalizeMappedRow({ bhk: "3" }, { bhk: "bhk" });
    expect(data.bhk).toBe(3);
  });
});
