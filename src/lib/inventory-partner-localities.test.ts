import { describe, it, expect } from "vitest";
import { inventoryPartnerSchema, updateInventoryPartnerSchema } from "@/lib/validators";

const BASE = {
  name: "Sharma Real Estate Dealers",
  phone: "9876543210",
};

describe("inventoryPartnerSchema localities", () => {
  it("accepts multiple manually entered localities and preserves all of them", () => {
    const parsed = inventoryPartnerSchema.parse({ ...BASE, localities: ["Rajouri Garden", "Dwarka", "Saket"] });
    expect(parsed.localities).toEqual(["Rajouri Garden", "Dwarka", "Saket"]);
  });

  it("trims whitespace around each locality on add", () => {
    const parsed = inventoryPartnerSchema.parse({ ...BASE, localities: ["  Dwarka  ", " Rajouri Garden"] });
    expect(parsed.localities).toEqual(["Dwarka", "Rajouri Garden"]);
  });

  it("drops entries that are blank after trimming", () => {
    const parsed = inventoryPartnerSchema.parse({ ...BASE, localities: ["Dwarka", "   ", ""] });
    expect(parsed.localities).toEqual(["Dwarka"]);
  });

  it("rejects case-insensitive duplicates within the same partner's list, keeping the first occurrence", () => {
    const parsed = inventoryPartnerSchema.parse({ ...BASE, localities: ["Rajouri Garden", "rajouri garden", "RAJOURI GARDEN"] });
    expect(parsed.localities).toEqual(["Rajouri Garden"]);
  });

  it("supports adding then removing a locality (client sends the resulting array)", () => {
    // simulates: add "Dwarka", add "Saket", then remove "Dwarka" before submit
    const afterAdd = ["Dwarka", "Saket"];
    const afterRemove = afterAdd.filter((l) => l !== "Dwarka");
    const parsed = inventoryPartnerSchema.parse({ ...BASE, localities: afterRemove });
    expect(parsed.localities).toEqual(["Saket"]);
  });

  it("preserves 2+ localities through the partial update schema used on PATCH", () => {
    const parsed = updateInventoryPartnerSchema.parse({ localities: ["Janakpuri", "Uttam Nagar", "Rohini"] });
    expect(parsed.localities).toEqual(["Janakpuri", "Uttam Nagar", "Rohini"]);
  });
});
