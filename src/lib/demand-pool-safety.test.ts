import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Repository-wide zero-auto-send guard for the demand-pool feature (rule
 * 26). Mirrors src/integrations/property-portals/provider-safety.test.ts's
 * pattern: asserted over the actual source of every demand-pool module and
 * route, not just exercised by a few call-site tests, so a later unrelated
 * change can't silently reintroduce an automatic WhatsApp send.
 */

const here = fileURLToPath(new URL(".", import.meta.url));
const srcRoot = join(here, "..");

const DEMAND_POOL_SOURCE_DIRECTORIES = [
  join(srcRoot, "app", "api", "customers"),
  join(srcRoot, "app", "api", "recommendations"),
  join(srcRoot, "app", "api", "properties", "[id]", "matches"),
  join(srcRoot, "app", "(app)", "customers"),
];
const EXTRA_DEMAND_POOL_FILES = [
  join(srcRoot, "lib", "demand-matching.ts"),
  join(srcRoot, "lib", "demand-recommendations.ts"),
  join(srcRoot, "lib", "demand-whatsapp.ts"),
  join(srcRoot, "lib", "demo-data", "demand-pool.ts"),
];

function collect(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...collect(full));
    else if (/\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

const demandPoolFiles = [...DEMAND_POOL_SOURCE_DIRECTORIES.flatMap(collect), ...EXTRA_DEMAND_POOL_FILES];
const sources = demandPoolFiles.map((path) => ({ path: path.slice(srcRoot.length + 1).replace(/\\/g, "/"), source: readFileSync(path, "utf8") }));
const productionSources = sources.filter((f) => !/\.test\.tsx?$/.test(f.path));

describe("demand pool source inventory", () => {
  it("actually found the demand-pool modules it claims to be guarding", () => {
    expect(productionSources.length).toBeGreaterThan(5);
    expect(productionSources.map((f) => f.path)).toContain("lib/demand-matching.ts");
    expect(productionSources.map((f) => f.path)).toContain("lib/demand-recommendations.ts");
  });
});

describe("zero auto-send (rule 26)", () => {
  it("only mark-sent/route.ts (real writes) and the deterministic demo seed (fixed prior history, not a live send) ever set status: \"SENT\"", () => {
    const allowed = new Set(["app/api/recommendations/[id]/mark-sent/route.ts", "lib/demo-data/demand-pool.ts"]);
    const offenders = productionSources
      .filter((f) => !allowed.has(f.path))
      .filter((f) => /status:\s*"SENT"/.test(f.source))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("the matching/recompute engine never imports a WhatsApp provider or sends a message", () => {
    const matchingFiles = productionSources.filter((f) => f.path === "lib/demand-matching.ts" || f.path === "lib/demand-recommendations.ts");
    for (const f of matchingFiles) {
      expect(f.source).not.toMatch(/sendTextMessage|sendTemplateMessage|sendMediaMessage|whatsapp-service|getWhatsAppProvider/i);
    }
  });

  it("contains no HTTP client call other than same-origin calls to this app's own API routes", () => {
    const offenders: string[] = [];
    for (const { path, source } of productionSources) {
      for (const match of source.matchAll(/fetch\(\s*(`|"|')([^`"']*)/g)) {
        if (!match[2].startsWith("/api/")) offenders.push(`${path}: fetch(${match[1]}${match[2]}...)`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("demo data never records a real send (channel implies click-to-chat/prepared only, never a Meta send confirmation)", () => {
    const demo = productionSources.find((f) => f.path === "lib/demo-data/demand-pool.ts")!;
    expect(demo.source).not.toMatch(/WHATSAPP_META/);
  });
});
