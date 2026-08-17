import { describe, expect, it } from "vitest";
import { canAccess, NAV_ITEMS, SELF_SERVICE_PATHS } from "./permissions";
import type { Role } from "@prisma/client";

const ROLES: Role[] = ["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"];

describe("self-service security page access", () => {
  it.each(ROLES)("%s can reach /settings/security to change their own password", (role) => {
    expect(canAccess(role, "/settings/security")).toBe(true);
  });

  it("keeps the rest of /settings ADMIN-only", () => {
    expect(canAccess("ADMIN", "/settings")).toBe(true);
    expect(canAccess("FIELD_EXECUTIVE", "/settings")).toBe(false);
    expect(canAccess("DATA_MANAGER", "/settings")).toBe(false);
  });

  it("does not open a sibling path that merely starts with the same characters", () => {
    expect(canAccess("FIELD_EXECUTIVE", "/settings/security-audit")).toBe(false);
  });

  it("keeps employee management ADMIN-only - a field executive cannot manage others", () => {
    expect(canAccess("FIELD_EXECUTIVE", "/employees")).toBe(false);
    expect(canAccess("FIELD_EXECUTIVE", "/employees/some-id")).toBe(false);
    expect(canAccess("DATA_MANAGER", "/employees")).toBe(false);
    expect(canAccess("ADMIN", "/employees")).toBe(true);
  });

  it("does not add the self-service page to the sidebar navigation", () => {
    expect(NAV_ITEMS.some((item) => SELF_SERVICE_PATHS.includes(item.href))).toBe(false);
  });
});
