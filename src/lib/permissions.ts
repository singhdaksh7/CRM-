import type { Role } from "@prisma/client";

/**
 * Simplified-role-workflow (feature/simplified-role-workflow): ADMIN keeps
 * every item it had before (nothing removed from ADMIN's list, plus the two
 * previously-unlisted config pages below are now explicit ADMIN-only entries
 * instead of falling through canAccess's default-allow). DATA_MANAGER and
 * FIELD_EXECUTIVE are trimmed down to the day-to-day work-tool flow: Lead ->
 * Call/WhatsApp -> Note -> Send Catalogue -> Follow-up -> Schedule Visit ->
 * (FE) perform visit -> outcome/rating -> next follow-up. Server-side
 * authorization on the underlying API routes is unchanged by this file -
 * hiding a nav item is a UX affordance only, never the security boundary.
 */
export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", roles: ["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"] as Role[] },
  { href: "/executive-dashboard", label: "Today's Work", roles: ["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"] as Role[] },
  { href: "/owner-dashboard", label: "Owner Dashboard", roles: ["ADMIN"] as Role[] },
  // FIELD_EXECUTIVE can view/report on properties (Objectives 7 & 10) but
  // create/update/delete stays gated at the API/route level to ADMIN/DATA_MANAGER
  // (see propertySchema-consuming routes) - this entry only controls page access.
  { href: "/properties", label: "Properties", roles: ["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"] as Role[] },
  { href: "/inventory-partners", label: "Inventory Partners", roles: ["ADMIN"] as Role[] },
  { href: "/requirements", label: "Requirements", roles: ["ADMIN"] as Role[] },
  { href: "/deals", label: "Deals", roles: ["ADMIN"] as Role[] },
  { href: "/leads", label: "Leads", roles: ["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"] as Role[] },
  // Demand pool (CustomerContact + requirements) — distinct from Leads.
  // Trimmed off the DATA_MANAGER/FIELD_EXECUTIVE sidebar per the simplified
  // work-tool flow (spec item 1); still fully available to ADMIN.
  { href: "/customers", label: "Customers", roles: ["ADMIN"] as Role[] },
  { href: "/catalogues", label: "Catalogues", roles: ["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"] as Role[] },
  { href: "/whatsapp", label: "WhatsApp", roles: ["ADMIN"] as Role[] },
  { href: "/visits", label: "Visits", roles: ["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"] as Role[] },
  // DATA_MANAGER: matches sidebar.tsx's own DATA_MANAGER.main config (which
  // already lists this link) and the "Follow-up" step in this file's own
  // documented work-tool flow above - ADMIN-only here silently dropped the
  // sidebar link and denied direct navigation for the role whose core
  // workflow explicitly includes it. FIELD_EXECUTIVE intentionally excluded:
  // sidebar.tsx's FIELD_EXECUTIVE.main never lists a Follow-ups link (their
  // flow reaches a follow-up from a completed visit outcome, not a
  // standalone nav item), so no matching UI gap exists for that role.
  { href: "/follow-ups", label: "Follow-ups", roles: ["ADMIN", "DATA_MANAGER"] as Role[] },
  { href: "/documents", label: "Documents", roles: ["ADMIN"] as Role[] },
  { href: "/notifications", label: "Notifications", roles: ["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"] as Role[] },
  { href: "/admin/property-issues", label: "Property Issues", roles: ["ADMIN"] as Role[] },
  // Previously reachable by every role because no NAV_ITEMS entry existed for
  // it (canAccess falls through to "allow" when a path matches nothing) -
  // now explicitly ADMIN-only, matching the "hide system config/integrations"
  // requirement for DATA_MANAGER/FIELD_EXECUTIVE.
  { href: "/integrations", label: "Integrations", roles: ["ADMIN"] as Role[] },
  { href: "/employees", label: "Employees", roles: ["ADMIN"] as Role[] },
  { href: "/reports", label: "Reports", roles: ["ADMIN"] as Role[] },
  { href: "/settings", label: "Settings", roles: ["ADMIN"] as Role[] },
];

/**
 * Pages every signed-in employee may reach regardless of role, even though a
 * prefix match against NAV_ITEMS would say otherwise. /settings is an
 * ADMIN-only nav entry, but /settings/security is each employee's own
 * password page - a Field Executive has to be able to open it.
 */
export const SELF_SERVICE_PATHS = ["/settings/security"];

export function canAccess(role: Role, href: string): boolean {
  if (SELF_SERVICE_PATHS.some((path) => href === path || href.startsWith(`${path}/`))) return true;
  const item = NAV_ITEMS.find((n) => href.startsWith(n.href));
  if (!item) return true;
  return item.roles.includes(role);
}

/** Field executives only see leads/visits assigned to them; admin & data manager see everything. */
export function isRestrictedToOwnRecords(role: Role): boolean {
  return role === "FIELD_EXECUTIVE";
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  DATA_MANAGER: "Data Manager",
  FIELD_EXECUTIVE: "Field Executive",
};
