import type { Prisma, LeadStatus, LeadPriority, PropertyStatus } from "@prisma/client";
import type { ParsedQuery } from "./search-types";

const LEAD_STATUS_VALUES: LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "PROPERTIES_SHARED",
  "VISIT_SCHEDULED",
  "VISIT_COMPLETED",
  "NEGOTIATION",
  "CLOSED_WON",
  "CLOSED_LOST",
  "NOT_INTERESTED",
  "INVALID",
];
const LEAD_PRIORITY_VALUES: LeadPriority[] = ["HOT", "WARM", "COLD"];
const PROPERTY_STATUS_VALUES: PropertyStatus[] = ["AVAILABLE", "RESERVED", "RENTED", "SOLD", "INACTIVE"];

/**
 * Per-entity Prisma `where` builders from a ParsedQuery. Every enum value is
 * checked against a whitelist before being assigned - an unrecognized/
 * mismatched status word (e.g. a Lead-only status parsed while searching
 * Properties) is silently ignored for that entity rather than crashing the
 * query with an invalid Prisma enum value.
 */

export function buildLeadWhere(parsed: ParsedQuery, organizationId: string, scopedAssignedToId?: string): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { organizationId };
  if (scopedAssignedToId) where.assignedToId = scopedAssignedToId;

  if (parsed.status && LEAD_STATUS_VALUES.includes(parsed.status as LeadStatus)) where.status = parsed.status as LeadStatus;
  if (parsed.status && LEAD_PRIORITY_VALUES.includes(parsed.status as LeadPriority)) where.priority = parsed.status as LeadPriority;
  if (parsed.bhk) where.preferredBhk = parsed.bhk;
  if (parsed.minPrice) where.maxBudget = { gte: parsed.minPrice };
  if (parsed.maxPrice) where.minBudget = { lte: parsed.maxPrice };
  if (parsed.locality) where.preferredLocation = { contains: parsed.locality, mode: "insensitive" };
  if (parsed.employeeName) where.assignedTo = { name: { contains: parsed.employeeName, mode: "insensitive" } };
  if (parsed.dateFilter === "OVERDUE") where.followUps = { some: { status: "OVERDUE" } };

  if (parsed.keywords.length > 0) {
    const kw = parsed.keywords.join(" ");
    where.OR = [{ clientName: { contains: kw, mode: "insensitive" } }, { phone: { contains: kw } }, { leadCode: { contains: kw, mode: "insensitive" } }];
  }
  return where;
}

export function buildPropertyWhere(parsed: ParsedQuery, organizationId: string): Prisma.PropertyWhereInput {
  const where: Prisma.PropertyWhereInput = { organizationId };

  if (parsed.status && PROPERTY_STATUS_VALUES.includes(parsed.status as PropertyStatus)) where.status = parsed.status as PropertyStatus;
  if (parsed.bhk) where.bhk = parsed.bhk;
  if (parsed.minPrice) where.OR = [{ monthlyRent: { gte: parsed.minPrice } }, { salePrice: { gte: parsed.minPrice } }];
  if (parsed.maxPrice) {
    const priceClause = [{ monthlyRent: { lte: parsed.maxPrice } }, { salePrice: { lte: parsed.maxPrice } }];
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { OR: priceClause }];
  }
  if (parsed.locality) where.area = { contains: parsed.locality, mode: "insensitive" };
  if (parsed.missingPhotos) where.images = "[]";

  if (parsed.keywords.length > 0) {
    const kw = parsed.keywords.join(" ");
    const kwClause = [{ propertyCode: { contains: kw, mode: "insensitive" as const } }, { title: { contains: kw, mode: "insensitive" as const } }, { area: { contains: kw, mode: "insensitive" as const } }, { address: { contains: kw, mode: "insensitive" as const } }];
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { OR: kwClause }];
  }
  return where;
}
