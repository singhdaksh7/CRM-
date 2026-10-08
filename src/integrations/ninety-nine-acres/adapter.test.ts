import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mapAcres99Lead, parseBudget, parseBhk, parseTransactionType, parseCommercialType, parseTimestamp, deriveFingerprint } = await import("./adapter");
const { sanitizePayload, parseBody, normalizeKey } = await import("./payload");
const { checkAcres99Authorization } = await import("./config");

describe("field aliases", () => {
  it("recognises aliases case-insensitively and ignoring punctuation", () => {
    for (const key of ["phone", "PHONE", "Mobile", "mobile_number", "Contact Number", "contactNumber", "mobileNumber"]) {
      expect(mapAcres99Lead({ [key]: "9811122233" }).canonical?.phone, key).toBe("919811122233");
    }
    expect(mapAcres99Lead({ LEAD_NAME: "Asha", phone: "9811122233" }).canonical?.name).toBe("Asha");
    expect(mapAcres99Lead({ Customer_Name: "Asha", phone: "9811122233" }).canonical?.name).toBe("Asha");
  });

  it("reads fields nested in an envelope", () => {
    const mapped = mapAcres99Lead({ data: { lead: { customerName: "Nested", mobile: "9811122233" } }, meta: { v: 1 } });
    expect(mapped.canonical).toMatchObject({ name: "Nested", phone: "919811122233" });
  });

  it("combines first and last name", () => {
    expect(mapAcres99Lead({ firstName: "A", lastName: "B", phone: "9811122233" }).canonical?.name).toBe("A B");
  });

  it("honours a country code and rejects non-Indian numbers as unmappable", () => {
    expect(mapAcres99Lead({ phone: "9811122233", countryCode: "+91" }).canonical?.phone).toBe("919811122233");
    expect(mapAcres99Lead({ phone: "415 555 2671" }).unmappableReason).toBe("invalid_phone");
  });

  it("reports unrecognised top-level fields so the adapter can be corrected from the first real payload", () => {
    expect(mapAcres99Lead({ phone: "9811122233", weirdKey: 1 }).snapshot.unmappedFields).toEqual(["weirdKey"]);
  });

  it("does not use a numeric `area` as the locality", () => {
    expect(mapAcres99Lead({ phone: "9811122233", area: 1200, city: "Delhi" }).canonical?.locality).toBe("Delhi");
  });
});

describe("minimum creation rule", () => {
  it("needs only a valid Indian mobile number", () => {
    expect(mapAcres99Lead({ phone: "9811122233" }).canonical).toBeDefined();
    expect(mapAcres99Lead({ name: "X", email: "a@b.com" }).canonical).toBeUndefined();
    expect(mapAcres99Lead({ name: "X", email: "a@b.com" }).unmappableReason).toBe("missing_phone");
  });
});

describe("parsers", () => {
  it.each([
    ["50 Lac", { max: 5_000_000 }],
    ["1.2 Cr", { max: 12_000_000 }],
    ["₹ 50,00,000", { max: 5_000_000 }],
    ["45000", { max: 45_000 }],
    ["50-80 Lac", { min: 5_000_000, max: 8_000_000 }],
    ["Rs. 1 Cr - 2 Cr", { min: 10_000_000, max: 20_000_000 }],
    ["negotiable", {}],
  ])("budget %s", (raw, expected) => expect(parseBudget(raw)).toEqual(expected));

  it("parses BHK only when it is a single deterministic count", () => {
    expect(parseBhk("3 BHK")).toBe(3);
    expect(parseBhk("2BHK")).toBe(2);
    expect(parseBhk("2,3 BHK")).toBeUndefined();
    expect(parseBhk("12")).toBeUndefined();
  });

  it("parses transaction types", () => {
    expect(parseTransactionType("Rent")).toBe("RENT");
    expect(parseTransactionType("Lease")).toBe("RENT");
    expect(parseTransactionType("Buy")).toBe("SALE");
    expect(parseTransactionType("Resale")).toBe("SALE");
    expect(parseTransactionType("who knows")).toBeUndefined();
  });

  it.each([["Shop", "SHOP"], ["Commercial Showroom", "SHOWROOM"], ["Office Space", "OFFICE"], ["Co-working", "CO_WORKING"], ["Warehouse/Godown", "WAREHOUSE"], ["SCO", "SCO"], ["Apartment", undefined]])("commercial type %s", (raw, expected) => expect(parseCommercialType(raw)).toBe(expected));

  it("parses timestamps and refuses implausible ones", () => {
    const now = new Date("2026-10-03T00:00:00Z");
    expect(parseTimestamp("2026-10-01T10:15:00Z", now)?.toISOString()).toBe("2026-10-01T10:15:00.000Z");
    expect(parseTimestamp("1790000000", now)).toBeDefined();
    expect(parseTimestamp("01/10/2026 10:15", now)?.getUTCMonth()).toBe(9);
    expect(parseTimestamp("2099-01-01", now)).toBeUndefined();
    expect(parseTimestamp("garbage", now)).toBeUndefined();
  });
});

describe("fingerprint", () => {
  it("is stable for the same delivery and differs when the listing, phone or time differs", () => {
    const base = { phone: "919811122233", listing: "L-1", timestamp: "t", message: "Hi  there" };
    expect(deriveFingerprint(base)).toBe(deriveFingerprint({ ...base, message: "hi there" }));
    expect(deriveFingerprint(base)).not.toBe(deriveFingerprint({ ...base, listing: "L-2" }));
    expect(deriveFingerprint(base)).not.toBe(deriveFingerprint({ ...base, phone: "919811122234" }));
    expect(deriveFingerprint(base)).not.toBe(deriveFingerprint({ ...base, timestamp: "u" }));
  });
});

describe("payload helpers", () => {
  it("sanitises credentials and the secret, deeply, but keeps everything else", () => {
    const out = sanitizePayload({ a: 1, password: "p", nested: { Authorization: "Bearer x", ok: "fine", note: "has s3cret inside" }, list: [{ apiKey: "k" }] }, "s3cret") as Record<string, unknown>;
    expect(out).toEqual({ a: 1, password: "[REDACTED]", nested: { Authorization: "[REDACTED]", ok: "fine", note: "[REDACTED]" }, list: [{ apiKey: "[REDACTED]" }] });
  });

  it("bounds depth and string length", () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
    expect(JSON.stringify(sanitizePayload(deep))).toContain("[max depth]");
    expect((sanitizePayload("x".repeat(10_000)) as string).length).toBeLessThan(4100);
  });

  it("parses JSON, form and tolerates a missing content type for JSON bodies", () => {
    expect(parseBody('{"a":1}', "application/json")).toMatchObject({ ok: true, format: "json" });
    expect(parseBody("a=1&a=2&b=x", "application/x-www-form-urlencoded; charset=utf-8")).toMatchObject({ ok: true, format: "form", payload: { a: ["1", "2"], b: "x" } });
    expect(parseBody('{"a":1}', "")).toMatchObject({ ok: true });
    expect(parseBody("hello", "")).toMatchObject({ ok: false, status: 415 });
    expect(normalizeKey("Lead_Name ")).toBe("leadname");
  });
});

describe("bearer comparison", () => {
  it("is exact", () => {
    expect(checkAcres99Authorization("Bearer abc", "abc")).toBe("ok");
    expect(checkAcres99Authorization("bearer   abc ", "abc")).toBe("ok");
    expect(checkAcres99Authorization("Bearer abd", "abc")).toBe("invalid");
    expect(checkAcres99Authorization("Bearer ", "abc")).toBe("missing");
    expect(checkAcres99Authorization(null, "abc")).toBe("missing");
  });
});
