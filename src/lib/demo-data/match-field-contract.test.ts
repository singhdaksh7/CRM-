import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Generic, future-proof regression guard for the exact bug class behind
 * this incident: matching.ts hard-gates on Property.assetClass/
 * Lead.assetClass/Lead.transactionType, both of which carry a schema
 * @default() that demo builders silently relied on instead of setting
 * explicitly - so the pure in-memory dry-run projection (fields simply
 * undefined on both sides) diverged from the real DB-persisted rows
 * (Prisma fills in the default) without either side ever looking wrong in
 * isolation.
 *
 * Rather than hardcoding "assetClass and transactionType must be set"
 * (which only re-tests what's already known and would say nothing about
 * the NEXT field the matcher starts hard-gating on), this test:
 *   1. parses prisma/schema.prisma for every Property/Lead field carrying
 *      an explicit @default(...) - fields the matcher can silently get a
 *      "wrong but present" value for if a builder omits them (fields with
 *      NO default and no `?` are non-nullable/required, so Prisma refuses
 *      the write outright if omitted - a loud failure, not a silent one;
 *      out of scope here on purpose),
 *   2. parses matching.ts's own source for `property.<field>` /
 *      `lead.<field>` accesses,
 *   3. intersects the two sets - every schema-defaulted field the matcher
 *      actually reads,
 *   4. asserts buildPropertyData (properties.ts) / buildLeadData (leads.ts)
 *      explicitly set each one.
 * A future PR that adds a new hard-gated, defaulted field to Property/Lead
 * without updating the demo builders makes this test fail immediately,
 * without anyone needing to remember this incident.
 */

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SCHEMA_PATH = path.join(REPO_ROOT, "prisma", "schema.prisma");
const MATCHING_PATH = path.join(REPO_ROOT, "src", "lib", "matching.ts");
const PROPERTIES_PATH = path.join(__dirname, "properties.ts");
const LEADS_PATH = path.join(__dirname, "leads.ts");

function extractDefaultedFields(schemaSource: string, modelName: string): string[] {
  const modelMatch = schemaSource.match(new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`));
  if (!modelMatch) throw new Error(`Could not find model ${modelName} in schema.prisma - test fixture is stale`);
  const body = modelMatch[1];
  const fields: string[] = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    // e.g. `assetClass     AssetClass     @default(RESIDENTIAL)` - first token is the field name.
    const fieldMatch = line.match(/^(\w+)\s+\S+.*@default\(/);
    if (fieldMatch) fields.push(fieldMatch[1]);
  }
  return fields;
}

function extractFieldAccesses(source: string, receiver: "property" | "lead"): Set<string> {
  const accesses = new Set<string>();
  const re = new RegExp(`\\b${receiver}\\.(\\w+)`, "g");
  for (const match of source.matchAll(re)) accesses.add(match[1]);
  return accesses;
}

describe("matching.ts hard-gated field completeness contract", () => {
  const schemaSource = fs.readFileSync(SCHEMA_PATH, "utf-8");
  const matchingSource = fs.readFileSync(MATCHING_PATH, "utf-8");
  const propertiesSource = fs.readFileSync(PROPERTIES_PATH, "utf-8");
  const leadsSource = fs.readFileSync(LEADS_PATH, "utf-8");

  const propertyDefaults = extractDefaultedFields(schemaSource, "Property");
  const leadDefaults = extractDefaultedFields(schemaSource, "Lead");
  const propertyAccesses = extractFieldAccesses(matchingSource, "property");
  const leadAccesses = extractFieldAccesses(matchingSource, "lead");

  it("sanity: the schema parser actually found the known defaulted fields (guards against the regex silently matching nothing)", () => {
    expect(propertyDefaults).toContain("assetClass");
    expect(propertyDefaults).toContain("status");
    expect(leadDefaults).toContain("assetClass");
    expect(leadDefaults).toContain("transactionType");
  });

  it("every Property field that is BOTH schema-defaulted AND read by matching.ts is explicitly set in buildPropertyData's return object", () => {
    const relevant = propertyDefaults.filter((f) => propertyAccesses.has(f));
    expect(relevant.length).toBeGreaterThan(0); // sanity - would silently pass on a broken parse otherwise
    const unmodeled = relevant.filter((f) => !new RegExp(`\\b${f}\\s*:`).test(propertiesSource));
    expect(unmodeled, `properties.ts must explicitly set: ${unmodeled.join(", ")}`).toEqual([]);
  });

  it("every Lead field that is BOTH schema-defaulted AND read by matching.ts is explicitly set in buildLeadData's return object", () => {
    const relevant = leadDefaults.filter((f) => leadAccesses.has(f));
    expect(relevant.length).toBeGreaterThan(0);
    const unmodeled = relevant.filter((f) => !new RegExp(`\\b${f}\\s*:`).test(leadsSource));
    expect(unmodeled, `leads.ts must explicitly set: ${unmodeled.join(", ")}`).toEqual([]);
  });
});
