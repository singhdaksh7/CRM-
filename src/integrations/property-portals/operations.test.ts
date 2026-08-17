import { describe, expect, it } from "vitest";
import { conflictFields } from "./operations";

describe("portal conflict decisions", () => {
  it("detects only supported CRM/provider differences", () => {
    expect(conflictFields({ price: 100, status: "AVAILABLE", title: "A" }, { price: 90, status: "AVAILABLE", title: "B", ignored: true })).toEqual(["price", "listingMetadata"]);
  });

  it("does not report equal supported fields", () => {
    expect(conflictFields({ price: 100, status: "AVAILABLE" }, { price: 100, status: "AVAILABLE" })).toEqual([]);
  });
});
