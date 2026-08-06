/**
 * Guards against production schema drift: prisma/schema.prisma (and
 * prisma/migrations/) can describe columns that were never actually applied
 * to the production database, because a migration was merged but
 * `prisma migrate deploy` was never run against it. tsc/prisma validate
 * can't catch this - they only check the schema file and the generated
 * client against each other, not the live database. Checked here via a
 * read-only information_schema query so a gap like this produces a clear
 * pre-write FAIL instead of a runtime P2022 mid-seed (see
 * prisma/manual-migrations/2026-08-06-catalogue-share-properties-drift-fix.sql
 * for the concrete drift this caught: catalogue_share_properties was
 * missing internalNote/isTopPick/addedManually/addedByUserId in production).
 */
export interface RequiredColumn {
  table: string;
  column: string;
}

/** Every catalogue_share_properties column that createDemoCatalogues() (src/lib/demo-data/catalogues.ts) and the real catalogue-sharing code path write to, beyond the columns present since the original init migration. */
export const REQUIRED_CATALOGUE_COLUMNS: readonly RequiredColumn[] = [
  { table: "catalogue_share_properties", column: "internalNote" },
  { table: "catalogue_share_properties", column: "isTopPick" },
  { table: "catalogue_share_properties", column: "addedManually" },
  { table: "catalogue_share_properties", column: "addedByUserId" },
];

export interface RawQueryClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

export interface CatalogueSchemaCheckResult {
  ok: boolean;
  missing: RequiredColumn[];
}

export async function checkCatalogueSchemaCompatibility(
  client: RawQueryClient,
  required: readonly RequiredColumn[] = REQUIRED_CATALOGUE_COLUMNS
): Promise<CatalogueSchemaCheckResult> {
  const tables = [...new Set(required.map((r) => r.table))];
  const rows = await client.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    tables
  );
  const present = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
  const missing = required.filter((r) => !present.has(`${r.table}.${r.column}`));
  return { ok: missing.length === 0, missing };
}
