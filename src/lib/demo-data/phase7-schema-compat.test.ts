import { describe, expect, it, vi } from "vitest";
import { checkPhase7EnumCompatibility, checkPhase7SchemaCompatibility, REQUIRED_PHASE7_COLUMNS, REQUIRED_PHASE7_ENUM_VALUES } from "./schema-compat";

describe("Phase 7 production compatibility checks", () => {
  it("passes when every required table column exists", async () => {
    const client = { $queryRawUnsafe: vi.fn().mockResolvedValue(REQUIRED_PHASE7_COLUMNS.map((item) => ({ table_name: item.table, column_name: item.column }))) };
    await expect(checkPhase7SchemaCompatibility(client)).resolves.toEqual({ ok: true, missing: [] });
  });
  it("reports all missing columns together", async () => {
    const client = { $queryRawUnsafe: vi.fn().mockResolvedValue([]) }; const result = await checkPhase7SchemaCompatibility(client);
    expect(result.ok).toBe(false); expect(result.missing).toHaveLength(REQUIRED_PHASE7_COLUMNS.length);
  });
  it("passes when all new enum types exist", async () => {
    const client = { $queryRawUnsafe: vi.fn().mockResolvedValue(REQUIRED_PHASE7_ENUM_VALUES.map((value) => { const [typname, enumlabel] = value.split("."); return { typname, enumlabel }; })) };
    await expect(checkPhase7EnumCompatibility(client)).resolves.toEqual({ ok: true, missing: [] });
  });
  it("reports multiple missing enum types", async () => {
    const client = { $queryRawUnsafe: vi.fn().mockResolvedValue([{ typname: "InventoryImportMode" }]) }; const result = await checkPhase7EnumCompatibility(client);
    expect(result.missing).toHaveLength(REQUIRED_PHASE7_ENUM_VALUES.length);
  });
});
