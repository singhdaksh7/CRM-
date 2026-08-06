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

/**
 * Phase 4 - every table the demo seeder writes to that didn't exist before
 * this phase. Higher drift risk than a single-column gap (the
 * catalogue_share_properties incident above) since several whole tables
 * land in one migration - checked the same way, reusing
 * checkCatalogueSchemaCompatibility's underlying logic (it's generic
 * despite the name; only the constant differs).
 */
export const REQUIRED_PHASE4_TABLES: readonly RequiredColumn[] = [
  { table: "inventory_partners", column: "partnerCode" },
  { table: "properties", column: "inventorySource" },
  { table: "properties", column: "partnerId" },
  { table: "property_timeline_events", column: "eventType" },
  { table: "property_availability_reports", column: "photoId" },
  { table: "property_reports", column: "type" },
  { table: "visit_feedback", column: "willVisitAgain" },
  { table: "lead_assignment_history", column: "method" },
  { table: "catalogue_version_events", column: "changeType" },
  { table: "catalogue_share_properties", column: "executiveStatus" },
  { table: "catalogue_share_properties", column: "removedAt" },
  { table: "property_favorites", column: "propertyId" },
  { table: "property_view_logs", column: "propertyId" },
];

export async function checkPhase4SchemaCompatibility(client: RawQueryClient): Promise<CatalogueSchemaCheckResult> {
  return checkCatalogueSchemaCompatibility(client, REQUIRED_PHASE4_TABLES);
}
