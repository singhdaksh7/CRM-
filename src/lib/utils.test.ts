import { describe, expect, it } from "vitest";
import { enumToLabel } from "./utils";

describe("enumToLabel", () => {
  it("safely renders nullable furnishing used by both matching components", () => {
    expect(enumToLabel(null)).toBe("-");
    expect(enumToLabel(undefined)).toBe("-");
    expect(enumToLabel("SEMI_FURNISHED")).toBe("Semi Furnished");
  });
});
