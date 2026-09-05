/**
 * TEST-ONLY in-memory fake standing in for a real Postgres connection.
 *
 * This repo has no existing pattern for a real-Postgres integration test in
 * vitest (its docker-compose Postgres is only ever used for manual dev/E2E
 * via Playwright, started by a human running `docker compose up -d`) -
 * every existing unit test for this exact kind of destructive-operation
 * logic (src/lib/demo-data/teardown.test.ts, scripts/seed-demo-dry-run.test.ts)
 * mocks the Prisma client instead of hitting a real database. This module
 * follows that same established convention, one step further: rather than
 * a plain jest-style mock (which can't express real rollback semantics), it
 * is a tiny in-memory relational store that implements deleteMany/count/
 * findMany/findUnique and a REAL atomic $transaction (snapshot before the
 * callback runs, restore on throw) - enough to genuinely exercise "does
 * executeReset() roll back everything on a mid-run failure", which a plain
 * mock cannot prove.
 */

export interface FakeRow {
  id: string;
  organizationId?: string;
  [key: string]: unknown;
}

type Table = Map<string, FakeRow>;
type State = Record<string, Table>;

/** relationField -> which parent table/FK this deletion-plan.ts relation filter resolves through. Mirrors deletion-plan.ts's relation-filter steps exactly. */
const RELATION_MAP: Record<string, { parentModel: string; fk: string }> = {
  catalogueShare: { parentModel: "catalogueShare", fk: "catalogueShareId" },
  requirementBroadcast: { parentModel: "requirementBroadcast", fk: "requirementBroadcastId" },
  importJob: { parentModel: "importJob", fk: "importJobId" },
  property: { parentModel: "property", fk: "propertyId" },
};

function deepCloneState(state: State): State {
  const next: State = {};
  for (const [model, table] of Object.entries(state)) {
    const nextTable: Table = new Map();
    for (const [id, row] of table.entries()) nextTable.set(id, { ...row });
    next[model] = nextTable;
  }
  return next;
}

function rowMatches(where: unknown, row: FakeRow, state: State): boolean {
  if (!where || typeof where !== "object") return true;
  for (const [key, value] of Object.entries(where as Record<string, unknown>)) {
    if (key === "organizationId") {
      if (row.organizationId !== value) return false;
      continue;
    }
    if (key === "id" && value && typeof value === "object" && "not" in (value as object)) {
      if (row.id === (value as { not: string }).not) return false;
      continue;
    }
    if (key === "email") {
      if (row.email !== value) return false;
      continue;
    }
    const rel = RELATION_MAP[key];
    if (rel) {
      const parentId = row[rel.fk] as string | undefined;
      const parent = parentId ? state[rel.parentModel]?.get(parentId) : undefined;
      if (!parent) return false;
      if (!rowMatches(value, parent, state)) return false;
      continue;
    }
    throw new Error(`fake-reset-db: unsupported where clause key "${key}"`);
  }
  return true;
}

export interface FakeResetDbOptions {
  appliedMigrationCount?: number;
  missingCoreTables?: string[];
  /** Test-only fault injection: deleteMany() on this exact model throws instead of deleting, so callers can prove $transaction rollback actually works. */
  failOnDeleteMany?: string;
}

export class FakeResetDb {
  private state: State;
  private appliedMigrationCount: number;
  private missingCoreTables: string[];
  private failOnDeleteMany: string | undefined;

  constructor(seed: Record<string, FakeRow[]> = {}, options: FakeResetDbOptions = {}) {
    this.state = {};
    for (const [model, rows] of Object.entries(seed)) {
      const table: Table = new Map();
      for (const row of rows) table.set(row.id, { ...row });
      this.state[model] = table;
    }
    this.appliedMigrationCount = options.appliedMigrationCount ?? 32;
    this.missingCoreTables = options.missingCoreTables ?? [];
    this.failOnDeleteMany = options.failOnDeleteMany;
  }

  private table(model: string, state: State = this.state): Table {
    if (!state[model]) state[model] = new Map();
    return state[model];
  }

  private makeModelDelegate(model: string, state: State) {
    return {
      count: async ({ where }: { where?: unknown } = {}) => {
        let n = 0;
        for (const row of this.table(model, state).values()) if (rowMatches(where, row, state)) n++;
        return n;
      },
      findMany: async ({ where }: { where?: unknown } = {}) => {
        const out: FakeRow[] = [];
        for (const row of this.table(model, state).values()) if (rowMatches(where, row, state)) out.push({ ...row });
        return out;
      },
      deleteMany: async ({ where }: { where?: unknown } = {}) => {
        if (this.failOnDeleteMany === model) {
          throw new Error("simulated mid-transaction failure");
        }
        const t = this.table(model, state);
        let n = 0;
        for (const [id, row] of [...t.entries()]) {
          if (rowMatches(where, row, state)) {
            t.delete(id);
            n++;
          }
        }
        return { count: n };
      },
    };
  }

  /**
   * Builds a full model-key -> delegate object over a given state snapshot
   * (used both for the live client and for the $transaction callback's
   * `tx`). Declared as an arrow class field (not a prototype method) with
   * an arrow-function Proxy `get` trap, so `this` throughout - including
   * inside the trap, which Proxy would otherwise invoke with its own
   * dynamic `this` - is always the lexically-captured FakeResetDb instance.
   * No `const self = this` aliasing needed anywhere in this class.
   */
  private buildClient = (state: State): unknown => {
    const proxy = new Proxy(
      {},
      {
        get: (_target, prop: string) => {
          if (prop === "organization") {
            return { findUnique: async ({ where: { id } }: { where: { id: string } }) => this.table("organization", state).get(id) ?? null };
          }
          if (prop === "user") {
            return {
              ...this.makeModelDelegate("user", state),
              findUnique: async ({ where: { email } }: { where: { email: string } }) => {
                for (const row of this.table("user", state).values()) if (row.email === email) return { ...row };
                return null;
              },
            };
          }
          if (prop === "propertyPortalConnection" || prop === "propertyImage" || prop === "document") {
            return this.makeModelDelegate(prop, state);
          }
          if (prop === "$queryRawUnsafe") {
            return async (query: string) => {
              if (query.includes("_prisma_migrations")) return [{ count: this.appliedMigrationCount }];
              if (query.includes("information_schema.tables")) {
                const CORE = ["organizations", "users", "properties", "leads", "_prisma_migrations"];
                return CORE.filter((t) => !this.missingCoreTables.includes(t)).map((t) => ({ table_name: t }));
              }
              return [];
            };
          }
          if (prop === "$transaction") {
            return async (fn: (tx: unknown) => Promise<unknown>) => {
              const snapshot = deepCloneState(this.state);
              const txState = this.state; // mutate live state directly during the callback
              const tx = this.buildClient(txState);
              try {
                return await fn(tx);
              } catch (error) {
                this.state = snapshot; // rollback - discard every mutation the callback made
                throw error;
              }
            };
          }
          // Every other model key (the full ResetModelKey union) gets the generic delegate.
          return this.makeModelDelegate(prop, state);
        },
      }
    );
    return proxy;
  };

  /** The client object to hand to preflight/reset/dry-run code under test. */
  get client() {
    return this.buildClient(this.state);
  }

  /** For assertions: read the live (post-test) row count for a model. */
  rowCount(model: string): number {
    return this.table(model, this.state).size;
  }

  hasRow(model: string, id: string): boolean {
    return this.table(model, this.state).has(id);
  }
}
