import type { Role } from "@prisma/client";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", roles: ["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"] as Role[] },
  { href: "/executive-dashboard", label: "My Dashboard", roles: ["ADMIN", "FIELD_EXECUTIVE"] as Role[] },
  { href: "/owner-dashboard", label: "Owner Dashboard", roles: ["ADMIN"] as Role[] },
  // FIELD_EXECUTIVE can view/report on properties (Objectives 7 & 10) but
  // create/update/delete stays gated at the API/route level to ADMIN/DATA_MANAGER
  // (see propertySchema-consuming routes) - this entry only controls page access.
  { href: "/properties", label: "Properties", roles: ["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"] as Role[] },
  { href: "/inventory-partners", label: "Inventory Partners", roles: ["ADMIN", "DATA_MANAGER"] as Role[] },
  { href: "/requirements", label: "Requirements", roles: ["ADMIN", "DATA_MANAGER"] as Role[] },
  { href: "/deals", label: "Deals", roles: ["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"] as Role[] },
  { href: "/leads", label: "Leads", roles: ["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"] as Role[] },
  { href: "/visits", label: "Visits", roles: ["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"] as Role[] },
  { href: "/follow-ups", label: "Follow-ups", roles: ["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"] as Role[] },
  { href: "/documents", label: "Documents", roles: ["ADMIN", "DATA_MANAGER"] as Role[] },
  { href: "/notifications", label: "Notifications", roles: ["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"] as Role[] },
  { href: "/admin/property-issues", label: "Property Issues", roles: ["ADMIN", "DATA_MANAGER"] as Role[] },
  { href: "/employees", label: "Employees", roles: ["ADMIN"] as Role[] },
  { href: "/reports", label: "Reports", roles: ["ADMIN"] as Role[] },
  { href: "/settings", label: "Settings", roles: ["ADMIN"] as Role[] },
];

export function canAccess(role: Role, href: string): boolean {
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
