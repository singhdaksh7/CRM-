import { describe, it, expect } from "vitest";
import { assignedToSelect } from "./user-select";

/**
 * Guards the fix in this commit: several endpoints used to
 * `include: { assignedTo: true }` and serialize the full User row -
 * including passwordHash - into API JSON and RSC payloads. This pins
 * assignedToSelect to exactly the fields the UI renders, so a future edit
 * can't silently widen it back to a bare `true` (or add a sensitive field)
 * without a test failing.
 */
describe("assignedToSelect", () => {
  it("only projects id and name", () => {
    expect(assignedToSelect).toEqual({ id: true, name: true });
  });

  it("never includes passwordHash or other account/auth fields", () => {
    const keys = Object.keys(assignedToSelect);
    for (const sensitive of ["passwordHash", "authVersion", "email", "phone", "notes"]) {
      expect(keys).not.toContain(sensitive);
    }
  });
});
