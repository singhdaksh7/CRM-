import { describe, expect, it } from "vitest";
import type { InventoryPartner, Owner, PropertyType, User } from "@prisma/client";
import { buildPropertyData } from "./properties";
import { Rng } from "./rng";
import { PROPERTY_TYPE_VALUES } from "../property-categories";

const assetsByType = Object.fromEntries(PROPERTY_TYPE_VALUES.map((type) => [type, ["/demo.jpg"]])) as Record<PropertyType, string[]>;
const employees = { admin: { id: "admin" }, dataManagers: [] } as unknown as { admin: User; dataManagers: User[] };

describe("buildPropertyData", () => {
  it("stores demo residential 1 RK listings as bhk zero and labels them 1 RK", () => {
    const rng = new Rng(20260806);
    const rows = Array.from({ length: 100 }, (_, index) => buildPropertyData(rng, index + 1, [] as Owner[], employees, assetsByType, [] as InventoryPartner[]));
    const oneRk = rows.find((row) => row.assetClass === "RESIDENTIAL" && row.bhk === 0);

    expect(oneRk).toBeDefined();
    expect(oneRk?.title).toContain("1 RK");
    expect(oneRk?.title).not.toContain("0 BHK");
  });

  it("keeps commercial bhk zero internal and never gives it a 1 RK title", () => {
    const rng = new Rng(20260806);
    const rows = Array.from({ length: 100 }, (_, index) => buildPropertyData(rng, index + 1, [] as Owner[], employees, assetsByType, [] as InventoryPartner[]));
    const commercial = rows.find((row) => row.assetClass === "COMMERCIAL" && row.bhk === 0);

    expect(commercial).toBeDefined();
    expect(commercial?.title).not.toContain("1 RK");
    expect(commercial?.title).not.toContain("0 BHK");
  });
});
