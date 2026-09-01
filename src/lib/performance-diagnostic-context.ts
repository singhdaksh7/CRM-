import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

type Metric = { duration: number; calls: number; parallel: boolean };
type Store = { metrics: Map<string, Metric> };

const storage = new AsyncLocalStorage<Store>();

/**
 * Preview diagnostic-only request context. This is deliberately process/request
 * local: it is never a cache and it never carries identities or query values.
 */
export async function collectPerformanceMetrics<T>(work: () => Promise<T>) {
  const store: Store = { metrics: new Map() };
  const value = await storage.run(store, work);
  return { value, metrics: Object.fromEntries(store.metrics) };
}

export async function measurePerformanceMetric<T>(name: string, work: () => Promise<T>, parallel = false): Promise<T> {
  const started = performance.now();
  try {
    return await work();
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
