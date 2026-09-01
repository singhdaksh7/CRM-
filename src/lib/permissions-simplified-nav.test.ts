import { describe, expect, it } from "vitest";
import { canAccess, NAV_ITEMS } from "./permissions";
import type { Role } from "@prisma/client";

/**
 * simplified-role-workflow (spec item 1): DATA_MANAGER and FIELD_EXECUTIVE
 * get a trimmed sidebar centered on the daily work-tool flow; ADMIN keeps
 * everything. These tests pin down the exact per-role nav surface so a
 * future change can't silently widen or narrow it.
 */

const daily = ["/dashboard", "/executive-dashboard", "/leads", "/visits", "/catalogues", "/notifications"];
const adminOnlyForStaff = [
  "/customers",
  "/whatsapp",
  "/documents",
  "/deals",
  "/requirements",
  "/inventory-partners",
  "/admin/property-issues",
  "/integrations",
  "/employees",
  "/reports",
  "/settings",
  "/owner-dashboard",
];

describe("simplified nav - DATA_MANAGER", () => {
  it.each(daily)("can reach %s", (href) => {
    expect(canAccess("DATA_MANAGER", href)).toBe(true);
  });

  it.each(adminOnlyForStaff)("cannot reach %s", (href) => {
    expect(canAccess("DATA_MANAGER", href)).toBe(false);
  });

  // Matches sidebar.tsx's own DATA_MANAGER.main config, which already lists
  // this link, and the "Follow-up" step in permissions.ts's documented
  // work-tool flow - was previously ADMIN-only, silently dropping the
  // sidebar link and denying direct navigation.
  it("can reach /follow-ups", () => {
    expect(canAccess("DATA_MANAGER", "/follow-ups")).toBe(true);
  });
});

describe("simplified nav - FIELD_EXECUTIVE", () => {
  it.each(daily)("can reach %s", (href) => {
    expect(canAccess("FIELD_EXECUTIVE", href)).toBe(true);
  });

  it.each(adminOnlyForStaff)("cannot reach %s", (href) => {
    expect(canAccess("FIELD_EXECUTIVE", href)).toBe(false);
  });

  // sidebar.tsx's FIELD_EXECUTIVE.main never lists a Follow-ups link - their
  // flow reaches a follow-up from a completed visit outcome, not a
  // standalone nav item - so unlike DATA_MANAGER this stays denied.
  it("cannot reach /follow-ups", () => {
    expect(canAccess("FIELD_EXECUTIVE", "/follow-ups")).toBe(false);
  });

  it("cannot reach Properties-adjacent admin config even though /properties itself stays open", () => {
    expect(canAccess("FIELD_EXECUTIVE", "/properties")).toBe(true);
    expect(canAccess("FIELD_EXECUTIVE", "/integrations/property-portals")).toBe(false);
  });
});

describe("simplified nav - ADMIN keeps everything", () => {
  it.each([...daily, ...adminOnlyForStaff, "/follow-ups"])("can reach %s", (href) => {
    expect(canAccess("ADMIN", href)).toBe(true);
  });

  it("every NAV_ITEMS entry includes ADMIN", () => {
    for (const item of NAV_ITEMS) {
      expect(item.roles as Role[]).toContain("ADMIN");
    }
  });
});
