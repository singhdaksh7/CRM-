import { describe, expect, it } from "vitest";
import { DEMO_INVENTORY_IMPORT_FIXTURE } from "./phase7-import";

describe("deterministic Phase 7 import fixture", () => {
  it("contains ten valid base rows plus five edge-case rows", () => expect(DEMO_INVENTORY_IMPORT_FIXTURE).toHaveLength(15));
  it("covers direct, indirect, owner reuse and partner matching", () => { const base = DEMO_INVENTORY_IMPORT_FIXTURE.slice(0, 10) as ReadonlyArray<Record<string, string>>; expect(base.some((row) => row["DIR/IND"] === "DIR")).toBe(true); expect(base.some((row) => row["DIR/IND"] === "IND" && row.Partner)).toBe(true); expect(base.filter((row) => row["Owner Phone"] === "9876500001").length).toBeGreaterThan(1); });
  it("covers exact/probable duplicates and invalid phone/price/update", () => expect((DEMO_INVENTORY_IMPORT_FIXTURE.slice(10) as ReadonlyArray<Record<string, string>>).map((row) => row.Scenario)).toEqual(["EXACT_DUPLICATE", "PROBABLE_DUPLICATE", "INVALID_PHONE", "INVALID_PRICE", "MISSING_REQUIRED_AND_UPDATE"]));
});
