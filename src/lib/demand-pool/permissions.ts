import type { Role } from "@prisma/client";

/** UI hints only — backend remains source of truth for enforcement. */
export function canManageDemandPool(role: Role): boolean {
  return role === "ADMIN" || role === "DATA_MANAGER";
}

export function canViewDemandPool(role: Role): boolean {
  return role === "ADMIN" || role === "DATA_MANAGER" || role === "FIELD_EXECUTIVE";
}

export function canBulkRecommend(role: Role): boolean {
  return role === "ADMIN" || role === "DATA_MANAGER";
}

export function canImportCustomers(role: Role): boolean {
  return role === "ADMIN" || role === "DATA_MANAGER";
}

export function canConvertToLead(role: Role): boolean {
  return role === "ADMIN" || role === "DATA_MANAGER";
}

export function canSendRecommendations(role: Role): boolean {
  return role === "ADMIN" || role === "DATA_MANAGER";
}
