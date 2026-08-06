/**
 * Guards against production enum drift, the same class of bug as
 * schema-compat.ts but for Postgres enum types instead of columns: a
 * migration that adds enum VALUES (e.g. via `ALTER TYPE ... ADD VALUE`) can
 * be checked into prisma/schema.prisma and prisma/migrations/ without ever
 * having been run against the production database. tsc only checks demo
 * generator code against the locally-generated @prisma/client enum (see
 * scripts/seed-demo-dry-run.ts's checkEnumCompatibility()) - it cannot see
 * whether the live database's pg_enum catalog actually has that value yet.
 * Checked here via a read-only pg_enum query.
 */
export interface RawQueryClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

/** Every NotificationType value src/lib/demo-data/notifications.ts's CATEGORIES table hardcodes - keep this in sync with that file by hand. */
export const NOTIFICATION_TYPES_USED_BY_DEMO_DATA: readonly string[] = [
  "HOT_LEAD_NO_FOLLOWUP",
  "VISIT_SCHEDULED",
  "PAYMENT_PENDING",
  "CATALOGUE_VIEWED",
  "PROPERTY_UNAVAILABLE_AFTER_SHARE",
  "FOLLOW_UP_DUE",
];

export interface ProductionEnumCheckResult {
  ok: boolean;
  missing: string[];
}

export async function checkNotificationTypeEnumInProduction(
  client: RawQueryClient,
  required: readonly string[] = NOTIFICATION_TYPES_USED_BY_DEMO_DATA
): Promise<ProductionEnumCheckResult> {
  const rows = await client.$queryRawUnsafe<{ enumlabel: string }[]>(
    `SELECT e.enumlabel
     FROM pg_enum e
     JOIN pg_type t ON e.enumtypid = t.oid
     WHERE t.typname = 'NotificationType'`
  );
  const present = new Set(rows.map((r) => r.enumlabel));
  const missing = required.filter((v) => !present.has(v));
  return { ok: missing.length === 0, missing };
}
