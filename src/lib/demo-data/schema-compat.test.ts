import { describe, it, expect, vi } from "vitest";
import { checkCatalogueSchemaCompatibility, REQUIRED_CATALOGUE_COLUMNS } from "./schema-compat";

function makeClient(columns: { table_name: string; column_name: string }[]) {
  return { $queryRawUnsafe: vi.fn().mockResolvedValue(columns) };
}

const ALL_PRESENT = REQUIRED_CATALOGUE_COLUMNS.map((c) => ({ table_name: c.table, column_name: c.column }));

describe("checkCatalogueSchemaCompatibility", () => {
  it("passes with ok=true and no missing columns when every required column is present", async () => {
    const result = await checkCatalogueSchemaCompatibility(makeClient(ALL_PRESENT));
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("fails and reports isTopPick when isTopPick is missing", async () => {
    const columns = ALL_PRESENT.filter((c) => c.column_name !== "isTopPick");
    const result = await checkCatalogueSchemaCompatibility(makeClient(columns));
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([{ table: "catalogue_share_properties", column: "isTopPick" }]);
  });

  it("fails and reports addedByUserId when a different required field is missing", async () => {
    const columns = ALL_PRESENT.filter((c) => c.column_name !== "addedByUserId");
    const result = await checkCatalogueSchemaCompatibility(makeClient(columns));
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([{ table: "catalogue_share_properties", column: "addedByUserId" }]);
  });

  it("reports every missing column when several are absent at once", async () => {
    const result = await checkCatalogueSchemaCompatibility(makeClient([]));
    expect(result.ok).toBe(false);
    expect(result.missing).toHaveLength(REQUIRED_CATALOGUE_COLUMNS.length);
  });
});
