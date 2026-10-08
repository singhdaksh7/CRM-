import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import { assertPropertyCategoryPatch, createPropertySchema, importCreatePropertySchema, propertySchema } from "./validators";

const residential = {
  title: "2 BHK in Janakpuri",
  propertyType: "APARTMENT",
  listingType: "RENT",
  assetClass: "RESIDENTIAL",
  description: "Spacious two bedroom flat",
  area: "Janakpuri",
  address: "C-1/23, Janakpuri",
  monthlyRent: 25000,
  bhk: 2,
  bathrooms: 2,
  furnishing: "SEMI_FURNISHED",
  builtUpAreaSqft: 1000,
  ownerName: "Owner One",
  ownerPhone: "9999999999",
};

// What the property form submits for commercial inventory: no BHK/bathrooms
// (the form sends 0), no residential furnishing (null), commercial fields.
const commercialShop = {
  title: "Ground floor shop on main road",
  propertyType: "SHOP",
  listingType: "RENT",
  assetClass: "COMMERCIAL",
  description: "Road-facing retail shop",
  area: "Rajouri Garden",
  address: "Shop 4, Main Market, Rajouri Garden",
  monthlyRent: 90000,
  bhk: 0,
  bathrooms: 0,
  furnishing: null,
  builtUpAreaSqft: 400,
  carpetAreaSqft: 350,
  superAreaSqft: 450,
  floorNumber: 0,
  totalFloors: 3,
  frontageFeet: 18,
  washrooms: 1,
  commercialFitOut: "BARE_SHELL",
  hasOpenParking: true,
  possessionStatus: "READY_TO_MOVE",
  ownerName: "Owner Two",
  ownerPhone: "9888888888",
};

const commercialOffice = {
  ...commercialShop,
  title: "Furnished office near metro",
  propertyType: "OFFICE",
  listingType: "SALE",
  monthlyRent: null,
  salePrice: 25000000,
  workstations: 30,
  cabins: 3,
  commercialFitOut: "FURNISHED",
};

describe("createPropertySchema - residential (unchanged)", () => {
  it("still accepts a normal residential listing", () => {
    expect(createPropertySchema.safeParse(residential).success).toBe(true);
  });

  it("still requires furnishing for residential inventory", () => {
    const result = createPropertySchema.safeParse({ ...residential, furnishing: null });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path[0] === "furnishing")).toBe(true);
  });

  it("rejects a commercial type saved as residential inventory", () => {
    const result = createPropertySchema.safeParse({ ...residential, propertyType: "SHOWROOM" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.find((i) => i.path[0] === "propertyType")?.message).toMatch(/residential property type/);
  });

  it("defaults a body with no category to RESIDENTIAL (existing callers keep working)", () => {
    const { assetClass, ...noCategory } = residential;
    void assetClass;
    const parsed = createPropertySchema.parse(noCategory);
    expect(parsed.assetClass).toBe("RESIDENTIAL");
  });
});

describe("createPropertySchema - commercial", () => {
  it("creates a Commercial Shop without BHK, bathrooms or residential furnishing", () => {
    const parsed = createPropertySchema.parse(commercialShop);
    expect(parsed.assetClass).toBe("COMMERCIAL");
    expect(parsed.propertyType).toBe("SHOP");
    expect(parsed.furnishing).toBeNull();
    expect(parsed.washrooms).toBe(1);
    expect(parsed.frontageFeet).toBe(18);
  });

  it("creates a Commercial Office for sale with workstations/cabins", () => {
    const parsed = createPropertySchema.parse(commercialOffice);
    expect(parsed.propertyType).toBe("OFFICE");
    expect(parsed.salePrice).toBe(25000000);
    expect(parsed.workstations).toBe(30);
  });

  it("does not require bhk/bathrooms at all for commercial (defaults to 0)", () => {
    const { bhk, bathrooms, ...rest } = commercialShop;
    void bhk; void bathrooms;
    const parsed = createPropertySchema.parse(rest);
    expect(parsed.bhk).toBe(0);
    expect(parsed.bathrooms).toBe(0);
  });

  it("rejects a residential type on commercial inventory", () => {
    const result = createPropertySchema.safeParse({ ...commercialShop, propertyType: "APARTMENT" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.find((i) => i.path[0] === "propertyType")?.message).toMatch(/commercial property type/);
  });

  it("rejects an unknown category or type outright", () => {
    expect(createPropertySchema.safeParse({ ...commercialShop, assetClass: "INDUSTRIAL_PARK" }).success).toBe(false);
    expect(createPropertySchema.safeParse({ ...commercialShop, propertyType: "KIOSK" }).success).toBe(false);
  });

  it("still accepts the legacy COMMERCIAL_SHOP/COMMERCIAL_OFFICE values for commercial", () => {
    expect(createPropertySchema.safeParse({ ...commercialShop, propertyType: "COMMERCIAL_SHOP" }).success).toBe(true);
    expect(createPropertySchema.safeParse({ ...commercialOffice, propertyType: "COMMERCIAL_OFFICE" }).success).toBe(true);
  });
});

describe("assertPropertyCategoryPatch - editing", () => {
  const storedShop = { assetClass: "COMMERCIAL", propertyType: "SHOP" };

  it("allows editing commercial-specific fields without touching category/type", () => {
    const patch = propertySchema.partial().parse({ washrooms: 2, frontageFeet: 22, monthlyRent: 95000 });
    expect(() => assertPropertyCategoryPatch(storedShop, patch)).not.toThrow();
  });

  it("allows changing a commercial listing's type to another commercial type", () => {
    expect(() => assertPropertyCategoryPatch(storedShop, { propertyType: "SHOWROOM" })).not.toThrow();
  });

  it("rejects flipping only the category when the stored type belongs to the other category", () => {
    expect(() => assertPropertyCategoryPatch(storedShop, { assetClass: "RESIDENTIAL" })).toThrow(ZodError);
    expect(() => assertPropertyCategoryPatch({ assetClass: "RESIDENTIAL", propertyType: "APARTMENT" }, { assetClass: "COMMERCIAL" })).toThrow(ZodError);
  });

  it("allows switching category together with a valid type", () => {
    expect(() => assertPropertyCategoryPatch(storedShop, { assetClass: "RESIDENTIAL", propertyType: "APARTMENT" })).not.toThrow();
  });

  it("reports the error on the propertyType field (what the form maps onto)", () => {
    try {
      assertPropertyCategoryPatch(storedShop, { propertyType: "VILLA" });
      throw new Error("expected throw");
    } catch (err) {
      expect((err as ZodError).issues[0].path).toEqual(["propertyType"]);
    }
  });
});

describe("importCreatePropertySchema - category consistency", () => {
  it("accepts a commercial import row with a commercial type", () => {
    expect(importCreatePropertySchema.safeParse({ ...commercialShop, propertyType: "WAREHOUSE" }).success).toBe(true);
  });

  it("rejects a commercial type on a residential import row", () => {
    expect(importCreatePropertySchema.safeParse({ ...residential, propertyType: "WAREHOUSE" }).success).toBe(false);
  });
});
