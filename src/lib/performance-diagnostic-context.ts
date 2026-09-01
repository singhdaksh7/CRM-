import { AsyncLocalStorage } from "node:async_hooks";

export type DiagnosticMetric = { duration: number; calls: number; parallel: boolean };
export type DiagnosticQuery = {
  model: string;
  operation: string;
  duration: number;
  calls: number;
  resultSize: "none" | "one" | "many" | "unknown";
  scope: string;
  /** Field names only; values and SQL never leave the diagnostic request. */
  filterFields: string;
  indexed: "UNKNOWN";
};
type Store = { metrics: Map<string, DiagnosticMetric>; queries: Map<string, DiagnosticQuery>; bypassCache: boolean; scopes: string[] };

const storage = new AsyncLocalStorage<Store>();

/**
 * Preview diagnostic-only request context. This is deliberately process/request
 * local: it is never a cache and it never carries identities or query values.
 */
export async function collectPerformanceMetrics<T>(work: () => Promise<T>, options: { bypassCache?: boolean } = {}) {
  const store: Store = { metrics: new Map(), queries: new Map(), bypassCache: options.bypassCache === true, scopes: [] };
  const value = await storage.run(store, work);
  return { value, metrics: Object.fromEntries(store.metrics), queries: [...store.queries.values()] };
}

/** True only while a Preview benchmark explicitly measures a cold loader path. */
export function shouldBypassDiagnosticCache(): boolean { return storage.getStore()?.bypassCache === true; }

export async function measurePerformanceMetric<T>(name: string, work: () => Promise<T>, parallel = false): Promise<T> {
  const started = performance.now();
  const parent = storage.getStore();
  try {
    return parent ? await storage.run({ ...parent, scopes: [...parent.scopes, name] }, work) : await work();
  } finally {
    const store = storage.getStore();
    if (store) {
      const current = store.metrics.get(name) ?? { duration: 0, calls: 0, parallel };
      current.duration += performance.now() - started;
      current.calls += 1;
      current.parallel ||= parallel;
      store.metrics.set(name, current);
    }
  }
}

/**
 * Redacts Prisma arguments down to field names used to shape the query. This
 * deliberately does not retain values, identifiers, SQL, or selections.
 */
function queryFieldNames(args: unknown): string {
  if (!args || typeof args !== "object") return "none";
  const input = args as Record<string, unknown>;
  const fields = new Set<string>();
  const collectWhere = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (["AND", "OR", "NOT"].includes(key)) {
        for (const item of Array.isArray(nested) ? nested : [nested]) collectWhere(item);
      } else {
        fields.add(key);
      }
    }
  };
  collectWhere(input.where);
  for (const key of ["by", "distinct", "orderBy"] as const) {
    const value = input[key];
    if (Array.isArray(value)) value.forEach((item) => collectWhere(item));
    else collectWhere(value);
  }
  return [...fields].sort().join(",") || "none";
}

/** Called by the Prisma client extension; retains metadata only, never query arguments or returned records. */
export function recordPrismaOperation(model: string | undefined, operation: string, duration: number, result: unknown, args: unknown): void {
  const store = storage.getStore();
  if (!store) return;
  const resultSize: DiagnosticQuery["resultSize"] = Array.isArray(result) ? (result.length ? "many" : "none") : result == null ? "none" : "one";
  const scope = store.scopes.join(" > ") || "unscoped";
  const filterFields = queryFieldNames(args);
  const key = `${scope}|${model ?? "raw"}|${operation}|${resultSize}|${filterFields}`;
  const current = store.queries.get(key) ?? { model: model ?? "raw", operation, duration: 0, calls: 0, resultSize, scope, filterFields, indexed: "UNKNOWN" as const };
  current.duration += duration; current.calls += 1;
  store.queries.set(key, current);
}
