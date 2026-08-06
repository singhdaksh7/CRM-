/**
 * Deterministic PRNG for the demo seed framework. Every generator module
 * takes a `Rng` instance seeded from a fixed constant (see constants.ts), so
 * re-running `npm run seed:demo` against an empty database always produces
 * byte-for-byte the same dataset - required for reproducible QA/regression
 * fixtures, not just "looks similar every time".
 *
 * Deliberately NOT Math.random() or crypto - this is fake demo data, not a
 * security-sensitive value, and determinism is the whole point.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** mulberry32 - small, fast, good-enough statistical quality for fixture generation. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  float(min: number, max: number, decimals = 2): number {
    const v = min + this.next() * (max - min);
    const p = 10 ** decimals;
    return Math.round(v * p) / p;
  }

  bool(probabilityTrue = 0.5): boolean {
    return this.next() < probabilityTrue;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** Picks `count` distinct items (no repeats) from arr, order preserved. */
  pickMany<T>(arr: readonly T[], count: number): T[] {
    const pool = [...arr];
    const out: T[] = [];
    const n = Math.min(count, pool.length);
    for (let i = 0; i < n; i++) {
      const idx = this.int(0, pool.length - 1);
      out.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return out;
  }

  weightedPick<T>(weighted: [T, number][]): T {
    const total = weighted.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [value, weight] of weighted) {
      r -= weight;
      if (r <= 0) return value;
    }
    return weighted[weighted.length - 1][0];
  }

  shuffle<T>(arr: readonly T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** Days offset from `now`, positive = future, negative = past. */
  daysFromNow(days: number, now: Date = new Date()): Date {
    return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  }

  /** Random date within [daysAgoMax, daysAgoMin] in the past (both >= 0, daysAgoMax further back). */
  pastDate(daysAgoMin: number, daysAgoMax: number, now: Date = new Date()): Date {
    const days = this.int(Math.min(daysAgoMin, daysAgoMax), Math.max(daysAgoMin, daysAgoMax));
    return this.daysFromNow(-days, now);
  }
}

export const DEMO_SEED = 20260806; // fixed - change only if the dataset shape intentionally changes
