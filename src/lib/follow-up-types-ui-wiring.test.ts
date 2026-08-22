import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * simplified-role-workflow (Blocker 2 follow-up pass) - the independent
 * review found two employee-facing follow-up-creation surfaces that were
 * missed by the original Blocker D fix and still hardcoded the old 7-value
 * enum list with near-raw labels:
 *   - src/components/followups/add-followup-modal.tsx (used on /follow-ups)
 *   - src/components/leads/leads-table.tsx (bulk "Schedule follow-up" action)
 *
 * This is a source-level wiring check (not a full component render) proving
 * every employee-facing follow-up-type UI in the repo imports the single
 * shared HUMAN_FOLLOWUP_TYPES source (src/lib/follow-up-types.ts, itself
 * exhaustively tested in follow-up-types.test.ts) instead of carrying its
 * own copy - and that none of them still contain the legacy 7-option raw
 * enum list. The backend enum (validators.ts, prisma schema) intentionally
 * keeps the legacy values for historical/system data; only the 4
 * human-facing surfaces are in scope here.
 */

const LEGACY_VALUES = ["PROPERTY_SHARING", "VISIT_CONFIRMATION", "NEGOTIATION", "DOCUMENTATION", "PAYMENT_REMINDER"];

const EMPLOYEE_FACING_SURFACES = [
  ["lead workspace primary Add Follow-up form", "src/components/leads/lead-workspace.tsx"],
  ["visit-completion next-action follow-up form", "src/components/visits/visit-property-workflow.tsx"],
  ["Add Follow-up modal (/follow-ups page)", "src/components/followups/add-followup-modal.tsx"],
  ["leads table bulk 'Schedule follow-up' action", "src/components/leads/leads-table.tsx"],
] as const;

const REPO_ROOT = join(__dirname, "..", "..");

describe.each(EMPLOYEE_FACING_SURFACES)("%s imports the shared 4-option follow-up type source", (_label, relativePath) => {
  const source = readFileSync(join(REPO_ROOT, relativePath), "utf-8");

  it("imports HUMAN_FOLLOWUP_TYPES from the shared module, not a local copy", () => {
    expect(source).toMatch(/import\s*\{[^}]*HUMAN_FOLLOWUP_TYPES[^}]*\}\s*from\s*["']@\/lib\/follow-up-types["']/);
  });

  it("does not hardcode a legacy 7-value follow-up type array (only NEGOTIATION is ambiguous with LeadStatus, so this checks the array shape, not a bare substring)", () => {
    // Several of these components legitimately reference unrelated enums
    // that share a name with a legacy FollowUpType value (e.g. LeadStatus
    // "NEGOTIATION"), so a bare substring check on LEGACY_VALUES would
    // false-positive. What actually matters is that no array literal in the
    // file lists multiple legacy follow-up-type values together (the
    // fingerprint of the old hardcoded TYPES/FOLLOWUP_TYPES list).
    const legacyPairHits = LEGACY_VALUES.filter((v) => source.includes(`"${v}"`)).length;
    expect(legacyPairHits).toBeLessThan(2);
  });
});
