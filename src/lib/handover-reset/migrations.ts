import fs from "node:fs";
import path from "node:path";

/**
 * Reads the REAL, current migration count off disk (one directory per
 * migration under prisma/migrations/, excluding migration_lock.toml which
 * is a file, not a migration) - never a hardcoded number. This is what
 * EXPECTED_MIGRATION_COUNT_AT_BUILD_TIME in constants.ts is cross-checked
 * against by a human, and what getAppliedMigrationCount() below is compared
 * against by the preflight check at runtime.
 */
export function getExpectedMigrationCountFromDisk(
  migrationsDir: string = path.join(process.cwd(), "prisma", "migrations")
): number {
  const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).length;
}

export interface MigrationCountClient {
  $queryRawUnsafe<T = unknown>(query: string, ...args: unknown[]): Promise<T>;
}

/**
 * Counts migrations Postgres itself believes are cleanly applied - excludes
 * anything still mid-flight (finished_at IS NULL) or explicitly rolled back,
 * so a half-applied or reverted migration can never silently count as
 * "matches expected".
 */
export async function getAppliedMigrationCount(client: MigrationCountClient): Promise<number> {
  const rows = await client.$queryRawUnsafe<{ count: number | bigint }[]>(
    `SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`
  );
  const raw = rows[0]?.count ?? 0;
  return typeof raw === "bigint" ? Number(raw) : raw;
}
