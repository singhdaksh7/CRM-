import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Secrets hygiene guard for the OLX + Sell.Do integration. A real OLX
 * dealer password / Sell.Do API key was never given to this implementation
 * and must never appear in source. This asserts the negative (no hardcoded
 * secret-shaped literal, and every credential env var is read from exactly
 * one file) rather than trying to prove a positive.
 */

const here = fileURLToPath(new URL(".", import.meta.url));
const integrationsRoot = join(here, "..");

function collect(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...collect(full));
    else if (/\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

const files = [...collect(join(integrationsRoot, "olx")), ...collect(join(integrationsRoot, "selldo"))]
  .filter((f) => !/\.test\.tsx?$/.test(f))
  .map((path) => ({ path: path.slice(integrationsRoot.length + 1).replace(/\\/g, "/"), source: readFileSync(path, "utf8") }));

describe("OLX + Sell.Do secrets hygiene", () => {
  it("found the files it claims to be guarding", () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files.map((f) => f.path)).toContain("olx/config.ts");
    expect(files.map((f) => f.path)).toContain("selldo/config.ts");
  });

  it("reads OLX_DEALER_LOGIN / OLX_DEALER_PASSWORD from exactly one file (olx/config.ts)", () => {
    const offenders = files.filter((f) => f.path !== "olx/config.ts" && /process\.env\.OLX_DEALER_(LOGIN|PASSWORD)/.test(f.source));
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it("reads SELLDO_API_KEY / SELLDO_SRD from exactly one file (selldo/config.ts)", () => {
    const offenders = files.filter((f) => f.path !== "selldo/config.ts" && /process\.env\.SELLDO_(API_KEY|SRD)/.test(f.source));
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it("contains no hardcoded credential/secret literal value (only process.env references)", () => {
    // A real secret would show up as a long opaque literal assigned to a
    // credential-shaped identifier; this repo only ever assigns
    // process.env.X or a test/placeholder literal - so a suspicious
    // non-test literal must never appear.
    const forbidden = /(access_token|refresh_token|api_key|secret_key)\s*[:=]\s*["'`][A-Za-z0-9_\-.]{16,}["'`]/i;
    const offenders = files.filter((f) => forbidden.test(f.source)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("never logs a token, password, or API key literal via logger/console", () => {
    const offenders: string[] = [];
    for (const { path, source } of files) {
      for (const match of source.matchAll(/(logger\.(info|warn|error)|console\.\w+)\(([\s\S]*?)\)/g)) {
        if (/accessToken|access_token|password|apiKey|api_key|refresh_token/i.test(match[0])) offenders.push(`${path}: ${match[0].slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("client modules are server-only", () => {
    for (const suffix of ["olx/client.ts", "olx/config.ts", "selldo/client.ts", "selldo/config.ts"]) {
      const file = files.find((f) => f.path === suffix);
      expect(file?.source.trimStart().startsWith('import "server-only"')).toBe(true);
    }
  });
});
