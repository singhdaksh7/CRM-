import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * simplified-role-workflow (targeted fix pass, Blocker B) - the lead detail
 * PAGE (a Next.js Server Component) does its own richer Prisma query rather
 * than calling the JSON API route, so it can't be exercised through the
 * same request/response harness used for src/app/api/leads/[id]/
 * lead-detail-access.test.ts (which covers the 4 required scenarios
 * behaviorally). This is the "page path" half of that coverage: a direct
 * source check proving the page shares isLeadAccessibleToUser instead of
 * carrying its own parallel copy of the access rule - which is exactly what
 * caused the bug (a stale inline check with no unassigned-lead carve-out).
 * isLeadAccessibleToUser's own behavior (assigned-self/unassigned/other-FE/
 * cross-org) is exhaustively covered by src/lib/lead-access.test.ts; this
 * test only needs to prove the page actually calls it.
 */
describe("lead detail page - FE access wiring (Blocker B)", () => {
  const source = readFileSync(join(__dirname, "page.tsx"), "utf-8");

  it("imports the shared isLeadAccessibleToUser predicate", () => {
    expect(source).toMatch(/import\s*\{\s*isLeadAccessibleToUser\s*\}\s*from\s*["']@\/lib\/lead-access["']/);
  });

  it("calls isLeadAccessibleToUser to gate access, not a re-derived inline check", () => {
    expect(source).toMatch(/isLeadAccessibleToUser\(lead,\s*session!?\.user\)/);
  });

  it("no longer contains the stale inline check that lacked the unassigned-lead carve-out", () => {
    expect(source).not.toMatch(/lead\.assignedToId\s*!==\s*session!?\.user\.id/);
  });
});
