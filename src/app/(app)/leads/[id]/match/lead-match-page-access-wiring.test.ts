import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * simplified-role-workflow (Blocker 1 follow-up pass) - the Property
 * Matching Workspace PAGE had its own stale inline check
 * (`lead.assignedToId !== session!.user.id`, no unassigned-lead carve-out).
 * Source check proving it now shares isLeadAccessibleToUser instead of
 * carrying its own parallel copy, matching the leads/[id]/page.tsx pattern.
 * isLeadAccessibleToUser's own behavior is exhaustively covered by
 * src/lib/lead-access.test.ts.
 */
describe("lead match page - FE access wiring (Blocker 1 follow-up)", () => {
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
