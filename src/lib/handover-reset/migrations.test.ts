import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getExpectedMigrationCountFromDisk, getAppliedMigrationCount } from "./migrations";
import { EXPECTED_MIGRATION_COUNT_AT_BUILD_TIME } from "./constants";

describe("getExpectedMigrationCountFromDisk", () => {
  it("counts the real prisma/migrations/ directories in this repo, matching the documented build-time count", () => {
    const migrationsDir = path.join(process.cwd(), "prisma", "migrations");
    const count = getExpectedMigrationCountFromDisk(migrationsDir);
    expect(count).toBe(EXPECTED_MIGRATION_COUNT_AT_BUILD_TIME);
  });

  it("never counts migration_lock.toml as a migration", () => {
    const migrationsDir = path.join(process.cwd(), "prisma", "migrations");
    const count = getExpectedMigrationCountFromDisk(migrationsDir);
    // If migration_lock.toml (a file, not a directory) were miscounted, this
    // would be off by one from the directory-only count above - assert the
    // helper is actually filtering by isDirectory(), not just counting entries.
    const allEntries = fs.readdirSync(migrationsDir);
    expect(count).toBeLessThan(allEntries.length);
  });
});

describe("getAppliedMigrationCount", () => {
  it("counts only cleanly-finished, non-rolled-back rows", async () => {
    const client = {
      $queryRawUnsafe: async (query: string) => {
        expect(query).toContain("_prisma_migrations");
        expect(query).toContain("finished_at");
        expect(query).toContain("rolled_back_at");
        return [{ count: 32 }];
      },
    };
    const count = await getAppliedMigrationCount(client as unknown as Parameters<typeof getAppliedMigrationCount>[0]);
    expect(count).toBe(32);
  });

  it("handles a bigint count result (raw SQL COUNT(*) can return bigint)", async () => {
    const client = { $queryRawUnsafe: async () => [{ count: BigInt(32) }] };
    const count = await getAppliedMigrationCount(client as unknown as Parameters<typeof getAppliedMigrationCount>[0]);
    expect(count).toBe(32);
  });
});
