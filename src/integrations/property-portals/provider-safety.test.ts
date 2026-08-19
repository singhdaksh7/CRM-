import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROPERTY_PORTAL_PROVIDERS, propertyPortalRegistry, canPublish } from "./registry";
import { listingActionState } from "./listing-lifecycle";

/**
 * Repository-wide provider-safety guard.
 *
 * Housing, 99acres, MagicBricks, OLX and Square Connect are all contract-only:
 * no authorized integration exists, so nothing in this codebase may call a
 * provider endpoint, scrape a portal, drive a browser against one, or carry a
 * hardcoded credential. That is easy to break later from an unrelated change
 * and no single unit test would notice - so it is asserted here over the
 * actual source of every portal module, route and component.
 */

const here = fileURLToPath(new URL(".", import.meta.url));
const srcRoot = join(here, "..", "..");

/** Every directory whose entire contents implement, expose or render the portal integrations. */
const PORTAL_SOURCE_DIRECTORIES = [
  join(srcRoot, "integrations", "property-portals"),
  join(srcRoot, "components", "property-portals"),
  join(srcRoot, "app", "api", "portal-leads"),
  join(srcRoot, "app", "api", "portal-listings"),
  join(srcRoot, "app", "api", "portal-operations"),
  join(srcRoot, "app", "api", "integrations"),
  join(srcRoot, "app", "(app)", "integrations"),
];

const EXTRA_PORTAL_FILES = [join(srcRoot, "lib", "demo-data", "portals.ts")];

function collect(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...collect(full));
    else if (/\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

const portalFiles = [...PORTAL_SOURCE_DIRECTORIES.flatMap(collect), ...EXTRA_PORTAL_FILES];
const sources = portalFiles.map((path) => ({ path: path.slice(srcRoot.length + 1).replace(/\\/g, "/"), source: readFileSync(path, "utf8") }));
/** Production code only - test files legitimately construct request objects and fixture URLs. */
const productionSources = sources.filter((f) => !/\.test\.tsx?$/.test(f.path));

describe("portal source inventory", () => {
  it("actually found the portal modules it claims to be guarding", () => {
    expect(productionSources.length).toBeGreaterThan(10);
    expect(productionSources.map((f) => f.path)).toContain("integrations/property-portals/registry.ts");
    expect(productionSources.map((f) => f.path)).toContain("lib/demo-data/portals.ts");
  });
});

describe("no external provider requests", () => {
  it("contains no HTTP client call other than same-origin calls to this app's own API routes", () => {
    const offenders: string[] = [];
    for (const { path, source } of productionSources) {
      for (const match of source.matchAll(/fetch\(\s*(`|"|')([^`"']*)/g)) {
        // A same-origin relative path ("/api/...") is this app calling itself,
        // which is the only permitted form.
        if (!match[2].startsWith("/api/")) offenders.push(`${path}: fetch(${match[1]}${match[2]}...)`);
      }
      for (const match of source.matchAll(/fetch\(\s*(?![`"'])/g)) {
        offenders.push(`${path}: fetch() with a non-literal target at offset ${match.index}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("imports no HTTP client or browser-automation library", () => {
    const forbidden = /\b(axios|undici|node-fetch|got|superagent|request-promise|puppeteer|playwright|selenium-webdriver|cheerio|jsdom)\b/;
    const offenders = productionSources.filter((f) => forbidden.test(f.source)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("uses no low-level node http/https request API", () => {
    const forbidden = /\b(https?\.(request|get)\(|XMLHttpRequest|new WebSocket\()/;
    const offenders = productionSources.filter((f) => forbidden.test(f.source)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("hardcodes no provider hostname or absolute URL", () => {
    const offenders: string[] = [];
    for (const { path, source } of productionSources) {
      for (const match of source.matchAll(/https?:\/\/[^\s"'`)]+/g)) offenders.push(`${path}: ${match[0]}`);
      if (/housing\.com|99acres\.(com|in)|magicbricks\.com|olx\.(in|com)|squareyards\.com/i.test(source)) offenders.push(`${path}: provider hostname`);
    }
    expect(offenders).toEqual([]);
  });

  it("hardcodes no credential, token or authorization header", () => {
    const forbidden = /(authorization\s*[:=]|["'`]bearer\s|x-api-key|client_secret|api_secret|["']apiKey["']\s*:\s*["'])/i;
    const offenders = productionSources.filter((f) => forbidden.test(f.source)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("never reads a provider credential out of the environment", () => {
    const offenders: string[] = [];
    for (const { path, source } of productionSources) {
      for (const match of source.matchAll(/process\.env\.(\w+)/g)) {
        if (/HOUSING|ACRES|MAGICBRICKS|OLX|SQUARE|PORTAL/i.test(match[1])) offenders.push(`${path}: process.env.${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("registry stays contract-only", () => {
  it("covers exactly the five documented providers", () => {
    expect([...PROPERTY_PORTAL_PROVIDERS]).toEqual(["HOUSING", "NINETY_NINE_ACRES", "MAGICBRICKS", "OLX", "SQUARE_CONNECT"]);
  });

  it("declares no AVAILABLE write capability for any provider", () => {
    for (const provider of PROPERTY_PORTAL_PROVIDERS) {
      const capabilities = propertyPortalRegistry[provider];
      expect(capabilities.supportsListingPublish).toBe("PARTNER_ACCESS_REQUIRED");
      expect(capabilities.supportsListingUpdate).toBe("PARTNER_ACCESS_REQUIRED");
      expect(capabilities.supportsListingDeactivate).toBe("PARTNER_ACCESS_REQUIRED");
      expect(capabilities.supportsLeadWebhook).toBe("PARTNER_ACCESS_REQUIRED");
      expect(capabilities.supportsLeadPull).toBe("PARTNER_ACCESS_REQUIRED");
    }
  });

  it("never reports any provider as publishable today", () => {
    for (const provider of PROPERTY_PORTAL_PROVIDERS) {
      expect(canPublish(propertyPortalRegistry[provider])).toBe(false);
    }
  });

  it("only ever uses documented capability statuses", () => {
    const allowed = ["AVAILABLE", "CONFIGURATION_REQUIRED", "PARTNER_ACCESS_REQUIRED", "NOT_SUPPORTED", "UNKNOWN"];
    for (const provider of PROPERTY_PORTAL_PROVIDERS) {
      for (const status of Object.values(propertyPortalRegistry[provider])) expect(allowed).toContain(status);
    }
  });
});

describe("listing actions stay blocked without capability and configuration", () => {
  const actions = ["PUBLISH", "UPDATE", "DEACTIVATE"] as const;

  it("blocks every action for every provider at its real capability status", () => {
    for (const provider of PROPERTY_PORTAL_PROVIDERS) {
      const capabilities = propertyPortalRegistry[provider];
      const capabilityFor = { PUBLISH: capabilities.supportsListingPublish, UPDATE: capabilities.supportsListingUpdate, DEACTIVATE: capabilities.supportsListingDeactivate };
      for (const action of actions) {
        expect(listingActionState(action, capabilityFor[action], true, "PUBLISHED")).toEqual({ allowed: false, reason: "PARTNER_ACCESS_REQUIRED" });
      }
    }
  });

  it("blocks every action when the connection is absent, whatever the capability says", () => {
    for (const action of actions) {
      expect(listingActionState(action, "AVAILABLE", false, "PUBLISHED")).toEqual({ allowed: false, reason: "NOT_CONFIGURED" });
    }
  });

  it("reports the unconfigured reason before the capability reason, so the UI never blames the wrong thing", () => {
    expect(listingActionState("PUBLISH", "NOT_SUPPORTED", false, "DRAFT")).toEqual({ allowed: false, reason: "NOT_CONFIGURED" });
  });

  it("surfaces each unavailable capability status verbatim rather than a generic failure", () => {
    for (const status of ["CONFIGURATION_REQUIRED", "PARTNER_ACCESS_REQUIRED", "NOT_SUPPORTED", "UNKNOWN"] as const) {
      expect(listingActionState("PUBLISH", status, true, "DRAFT")).toEqual({ allowed: false, reason: status });
    }
  });
});

describe("the generic webhook route stays non-operational", () => {
  const webhookSource = readFileSync(join(srcRoot, "app", "api", "integrations", "property-portals", "[provider]", "webhook", "route.ts"), "utf8");

  it("returns 501 and states that no payload was processed", () => {
    expect(webhookSource).toContain("501");
    expect(webhookSource).toMatch(/No payload was processed/i);
  });

  it("never reaches ingestion from an unverified webhook", () => {
    expect(webhookSource).not.toMatch(/ingestPortalLead|prisma\./);
  });

  it("bounds the request body before doing anything else", () => {
    expect(webhookSource).toContain("413");
  });
});
