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
  "/follow-ups",
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
});

describe("simplified nav - FIELD_EXECUTIVE", () => {
  it.each(daily)("can reach %s", (href) => {
    expect(canAccess("FIELD_EXECUTIVE", href)).toBe(true);
  });

  it.each(adminOnlyForStaff)("cannot reach %s", (href) => {
    expect(canAccess("FIELD_EXECUTIVE", href)).toBe(false);
  });

  it("cannot reach Properties-adjacent admin config even though /properties itself stays open", () => {
    expect(canAccess("FIELD_EXECUTIVE", "/properties")).toBe(true);
    expect(canAccess("FIELD_EXECUTIVE", "/integrations/property-portals")).toBe(false);
  });
});

describe("simplified nav - ADMIN keeps everything", () => {
  it.each([...daily, ...adminOnlyForStaff])("can reach %s", (href) => {
    expect(canAccess("ADMIN", href)).toBe(true);
  });

  it("every NAV_ITEMS entry includes ADMIN", () => {
    for (const item of NAV_ITEMS) {
      expect(item.roles as Role[]).toContain("ADMIN");
    }
  });
});
