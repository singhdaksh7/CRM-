/**
 * "Is this even the right database" sanity checks - deliberately independent
 * of, and in addition to, the migration-count and org/admin checks in
 * preflight.ts. None of this ever reads or returns a credential: only the
 * hostname (never user/password/query string) is ever surfaced in a report.
 */

/** Extracts just the hostname from a Postgres connection string - never logs/returns the credential portion. */
export function extractSafeHost(databaseUrl: string | undefined): string {
  if (!databaseUrl) return "unset";
  try {
    const url = new URL(databaseUrl);
    return url.hostname || "unparseable";
  } catch {
    return "unparseable";
  }
}

export interface SchemaSanityClient {
  $queryRawUnsafe<T = unknown>(query: string, ...args: unknown[]): Promise<T>;
}

/**
 * Tables that must all exist for this to plausibly be THIS project's
 * database at THIS schema revision - a cheap, fast guard against pointing
 * the tool at an unrelated Postgres instance (a different app, an empty
 * throwaway DB, etc.) before any migration-count or org/admin check even
 * runs. Deliberately a small, stable subset of core tables rather than
 * every table in the schema, so this check doesn't itself become a source
 * of false negatives as the schema evolves.
 */
const CORE_TABLES = [
  "organizations",
  "users",
  "properties",
  "leads",
  "_prisma_migrations",
] as const;

export interface SchemaIdentityCheck {
  passed: boolean;
  missingTables: string[];
}

export async function checkSchemaIdentity(client: SchemaSanityClient): Promise<SchemaIdentityCheck> {
  const rows = await client.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)`,
    CORE_TABLES as unknown as string[]
  );
  const present = new Set(rows.map((r) => r.table_name));
  const missingTables = CORE_TABLES.filter((t) => !present.has(t));
  return { passed: missingTables.length === 0, missingTables };
}
