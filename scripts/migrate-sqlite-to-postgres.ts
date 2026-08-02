/**
 * One-time SQLite -> PostgreSQL data migration for the Phase 3A cutover.
 *
 * Reads every table directly out of the legacy `dev.db` SQLite file (via
 * sql.js - a pure WASM SQLite reader, chosen specifically because it needs
 * no native build toolchain, unlike better-sqlite3) and bulk-inserts into
 * the PostgreSQL database the app's Prisma Client is currently configured
 * for (DATABASE_URL). Table order and Boolean/DateTime coercion are derived
 * automatically from Prisma's DMMF, not hand-maintained, so this script
 * doesn't drift out of sync as the schema grows.
 *
 * Usage:
 *   SQLITE_SOURCE_PATH=./prisma/dev.db npx tsx scripts/migrate-sqlite-to-postgres.ts
 *
 * Safe to re-run: every table insert uses skipDuplicates, so re-running
 * against a partially-migrated Postgres database will only insert what's
 * missing, never throw on already-migrated rows.
 */
import initSqlJs from "sql.js";
import { readFileSync } from "fs";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

// Prisma model name -> { dbTableName, camelCasedClientAccessor }
type ModelInfo = {
  dbName: string;
  clientKey: string;
  booleanFields: string[];
  dateTimeFields: string[];
  dependsOn: string[]; // other db table names this table has FKs to (excluding self-refs)
};

function buildModelInfo(): ModelInfo[] {
  const models = Prisma.dmmf.datamodel.models;
  return models.map((model) => {
    const booleanFields = model.fields.filter((f) => f.kind === "scalar" && f.type === "Boolean").map((f) => f.name);
    const dateTimeFields = model.fields.filter((f) => f.kind === "scalar" && f.type === "DateTime").map((f) => f.name);
    const dependsOn = model.fields
      .filter((f) => f.kind === "object" && f.relationFromFields && f.relationFromFields.length > 0)
      .map((f) => models.find((m) => m.name === f.type))
      .filter((m): m is (typeof models)[number] => !!m && m.name !== model.name)
      .map((m) => m.dbName ?? m.name);
    return {
      dbName: model.dbName ?? model.name,
      clientKey: model.name.charAt(0).toLowerCase() + model.name.slice(1),
      booleanFields,
      dateTimeFields,
      dependsOn: [...new Set(dependsOn)],
    };
  });
}

/** Topological sort so every table is inserted after every table it references. */
function orderByDependencies(models: ModelInfo[]): ModelInfo[] {
  const byName = new Map(models.map((m) => [m.dbName, m]));
  const visited = new Set<string>();
  const ordered: ModelInfo[] = [];

  function visit(model: ModelInfo, stack: Set<string>) {
    if (visited.has(model.dbName)) return;
    if (stack.has(model.dbName)) return; // circular - break the cycle, both sides have optional FKs in this schema
    stack.add(model.dbName);
    for (const dep of model.dependsOn) {
      const depModel = byName.get(dep);
      if (depModel) visit(depModel, stack);
    }
    stack.delete(model.dbName);
    visited.add(model.dbName);
    ordered.push(model);
  }

  for (const model of models) visit(model, new Set());
  return ordered;
}

function coerceRow(row: Record<string, unknown>, info: ModelInfo): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const field of info.booleanFields) {
    if (out[field] !== null && out[field] !== undefined) out[field] = Number(out[field]) === 1;
  }
  for (const field of info.dateTimeFields) {
    if (out[field] !== null && out[field] !== undefined) out[field] = new Date(out[field] as string);
  }
  return out;
}

async function main() {
  const sourcePath = process.env.SQLITE_SOURCE_PATH ?? "./prisma/dev.db";
  console.log(`Reading legacy SQLite database: ${sourcePath}`);

  const SQL = await initSqlJs();
  const fileBuffer = readFileSync(sourcePath);
  const db = new SQL.Database(fileBuffer);

  const models = orderByDependencies(buildModelInfo());
  const summary: { table: string; sourceRows: number; insertedOrExisting: number; destRows: number; ok: boolean }[] = [];

  for (const model of models) {
    const stmt = db.prepare(`SELECT * FROM "${model.dbName}"`);
    const rows: Record<string, unknown>[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();

    if (rows.length === 0) {
      summary.push({ table: model.dbName, sourceRows: 0, insertedOrExisting: 0, destRows: 0, ok: true });
      continue;
    }

    const coerced = rows.map((r) => coerceRow(r, model));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic bulk-insert across every model, accessor name is derived at runtime from DMMF
    const client = (prisma as any)[model.clientKey];
    const result = await client.createMany({ data: coerced, skipDuplicates: true });
    const destCount = await client.count();

    summary.push({
      table: model.dbName,
      sourceRows: rows.length,
      insertedOrExisting: result.count,
      destRows: destCount,
      ok: destCount >= rows.length,
    });
    console.log(`  ${model.dbName}: ${rows.length} source rows -> ${result.count} inserted (${destCount} now in Postgres)`);
  }

  db.close();

  console.log("\nValidation summary:");
  console.table(summary);
  const failed = summary.filter((s) => !s.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length} table(s) have FEWER rows in Postgres than in SQLite - investigate before cutting traffic over:`);
    console.error(failed.map((f) => f.table).join(", "));
    process.exitCode = 1;
  } else {
    console.log("\nAll tables migrated - row counts in Postgres are >= SQLite source for every table.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
