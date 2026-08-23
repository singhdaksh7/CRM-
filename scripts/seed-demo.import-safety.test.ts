import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Regression coverage for the incident where `npm run seed:demo` crashed
 * before any database write: scripts/seed-demo.ts -> src/lib/demo-data/verify.ts
 * -> src/lib/dashboard-data.ts -> src/lib/organization.ts, whose first line
 * is `import "server-only"` - fine inside the Next.js app, fatal for a
 * plain `tsx` process ("This module cannot be imported from a Client
 * Component module"). Fixed by replacing verify.ts's use of
 * getDashboardData() with src/lib/demo-data/dashboard-verify.ts's
 * getDemoVerificationMetrics(), which is Prisma-only.
 *
 * Two independent checks, deliberately not just one:
 *  - a static import-graph walk (fast, runs every vitest invocation)
 *  - a real subprocess spawn of the actual tsx CLI against the actual
 *    entrypoint (slower, but the ONLY one of the two that can't be fooled -
 *    vitest.config.ts aliases "server-only" to a stub for React-component
 *    tests, which would silently hide this exact regression if the whole
 *    check ran inside vitest's own module resolution instead of a real
 *    separate process).
 */

const REPO_ROOT = path.resolve(__dirname, "..");
const SRC_ROOT = path.join(REPO_ROOT, "src");
const TSX_CLI = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");

const SEED_ENTRYPOINTS = [path.join(REPO_ROOT, "scripts", "seed-demo.ts"), path.join(REPO_ROOT, "scripts", "seed-demo-dry-run.ts")];

const IMPORT_SPECIFIER_RE = /(?:import|export)\s+(?:[^'";]*?from\s+)?["']([^"']+)["']|require\(["']([^"']+)["']\)/;

/**
 * Line-based on purpose (this codebase's imports are single-line): a whole-
 * statement `import type {...} from "..."` / `export type {...} from "..."`
 * is erased entirely at compile time (no runtime require()/import call is
 * ever emitted for it - confirmed by the real-tsx-subprocess test below
 * passing even though catalogue-dto.ts's `import type { getCatalogueByToken }
 * from "./catalogues"` is in this graph), so it must NOT be treated as a
 * real edge or this walker reports false-positive regressions. A mixed
 * import like `import { type X, Y } from "..."` still executes at runtime
 * (Y is a real binding) and IS still followed, since it doesn't start with
 * "import type"/"export type".
 */
function extractImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (/^(import|export)\s+type\b/.test(line)) continue;
    const match = line.match(IMPORT_SPECIFIER_RE);
    if (match) specifiers.push(match[1] ?? match[2]);
  }
  return specifiers;
}

function resolveModuleFile(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith(".")) {
    base = path.resolve(path.dirname(fromFile), specifier);
  } else if (specifier.startsWith("@/")) {
    base = path.join(SRC_ROOT, specifier.slice(2));
  } else {
    return null; // external package - outside this repo's own graph
  }
  const candidates = [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")];
  return candidates.find((c) => fs.existsSync(c)) ?? null;
}

function walkImportGraph(entryFiles: string[]): Set<string> {
  const visited = new Set<string>();
  const queue = [...entryFiles];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    const source = fs.readFileSync(file, "utf-8");
    for (const specifier of extractImportSpecifiers(source)) {
      const resolved = resolveModuleFile(specifier, file);
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }
  return visited;
}

describe("demo-seed import graph - static walk", () => {
  it("scripts/seed-demo.ts and scripts/seed-demo-dry-run.ts never transitively import src/lib/organization.ts or the server-only package", () => {
    const graph = walkImportGraph(SEED_ENTRYPOINTS);

    const organizationFile = path.join(SRC_ROOT, "lib", "organization.ts");
    expect([...graph]).not.toContain(organizationFile);

    const filesImportingServerOnly = [...graph].filter((f) => /from\s+["']server-only["']|require\(["']server-only["']\)/.test(fs.readFileSync(f, "utf-8")));
    expect(filesImportingServerOnly).toEqual([]);

    // Sanity check the walker itself isn't vacuously passing (e.g. broken resolution finding 0 files).
    expect(graph.size).toBeGreaterThan(15);
  });
});

describe("scripts/seed-demo.ts - safety gate runs before any write (static order check)", () => {
  it("calls assertDemoSeedSafe() before teardownDemoData() in source order", () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, "scripts", "seed-demo.ts"), "utf-8");
    // The actual call sites, not any textual mention - the file's own doc
    // comment near the top references "teardownDemoData()" in prose
    // (explaining that validation happens before it runs), which would
    // give a false-positive match if searched for loosely.
    const safetyGateIndex = source.indexOf("assertDemoSeedSafe();");
    const firstWriteIndex = source.indexOf("await teardownDemoData();");
    expect(safetyGateIndex).toBeGreaterThan(-1);
    expect(firstWriteIndex).toBeGreaterThan(-1);
    expect(safetyGateIndex).toBeLessThan(firstWriteIndex);
  });

  it("does not auto-execute main() as a module-load side effect (guarded by require.main === module)", () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, "scripts", "seed-demo.ts"), "utf-8");
    expect(source).toContain("if (require.main === module)");
    expect(source).toContain("export async function main()");
  });
});

describe("scripts/seed-demo.ts - real tsx subprocess (not vitest's module resolution)", () => {
  it("loads its entire module graph under the real tsx CLI without the server-only crash, and is blocked by the safety gate before touching a database", () => {
    const env: NodeJS.ProcessEnv = { ...process.env };
    // Guarantee this can never reach a real database no matter what
    // upstream changes: the safety gate must trip on its very first check,
    // before any Prisma call. Explicit empty string (not `delete`) so
    // tsx's own .env auto-load - which follows dotenv's "don't override an
    // already-present key" rule - can't reintroduce the real DATABASE_URL.
    env.DATABASE_URL = "";
    delete env.I_UNDERSTAND_THIS_WRITES_DEMO_DATA_TO_PRODUCTION;
    delete env.DEMO_SEED_CONFIRMATION;
    delete env.DEMO_SEED_ALLOW_REMOTE;
    delete env.ALLOW_DEMO_SEED;

    const result = spawnSync(process.execPath, [TSX_CLI, "scripts/seed-demo.ts"], {
      cwd: REPO_ROOT,
      env,
      encoding: "utf-8",
      timeout: 60_000,
    });

    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

    expect(output).not.toContain("server-only");
    expect(output).not.toContain("Client Component");
    expect(output).not.toContain("Cannot find module");

    expect(output).toContain("[demo-seed] BLOCKED");
    expect(output).toContain("DATABASE_URL is not set");
    expect(result.status).toBe(1);
  }, 60_000);
});
