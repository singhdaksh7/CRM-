import { prisma } from "../prisma";
import { notificationVisibilityWhere } from "../notifications";
import { formatINR } from "../utils";
import { buildLeadWhere, buildPropertyWhere } from "./filters";
import { parseSearchQuery } from "./parser";
import type { Role } from "@prisma/client";
import type { SearchEntityType, SearchResponse, SearchResultItem } from "./search-types";

const PER_ENTITY_LIMIT = 8;
const TOTAL_LIMIT = 40;

interface SearchContext {
  organizationId: string;
  role: Role;
  userId: string;
}

async function searchLeads(parsed: ReturnType<typeof parseSearchQuery>, ctx: SearchContext): Promise<SearchResultItem[]> {
  const scopedAssignedToId = ctx.role === "FIELD_EXECUTIVE" ? ctx.userId : undefined;
  const rows = await prisma.lead.findMany({
    where: buildLeadWhere(parsed, ctx.organizationId, scopedAssignedToId),
    select: { id: true, clientName: true, phone: true, preferredLocation: true, status: true },
    take: PER_ENTITY_LIMIT,
    orderBy: { createdAt: "desc" },
  });
  return rows.map((l) => ({ entity: "LEAD", id: l.id, title: l.clientName, subtitle: `${l.phone} · ${l.preferredLocation}`, href: `/leads/${l.id}`, badge: l.status.replace(/_/g, " ") }));
}

async function searchProperties(parsed: ReturnType<typeof parseSearchQuery>, ctx: SearchContext): Promise<SearchResultItem[]> {
  const rows = await prisma.property.findMany({
    where: buildPropertyWhere(parsed, ctx.organizationId),
    select: { id: true, title: true, propertyCode: true, area: true, status: true, listingType: true, monthlyRent: true, salePrice: true },
    take: PER_ENTITY_LIMIT,
    orderBy: { createdAt: "desc" },
  });
  return rows.map((p) => ({
    entity: "PROPERTY",
    id: p.id,
    title: `${p.propertyCode} - ${p.title}`,
    subtitle: `${p.area} · ${p.listingType === "RENT" ? formatINR(p.monthlyRent, { suffix: "month" }) : formatINR(p.salePrice, { compact: true })}`,
    href: `/properties/${p.id}`,
    badge: p.status,
  }));
}

async function searchEmployees(parsed: ReturnType<typeof parseSearchQuery>, ctx: SearchContext): Promise<SearchResultItem[]> {
  if (ctx.role === "FIELD_EXECUTIVE") return [];
  const kw = (parsed.employeeName ?? parsed.keywords.join(" ")).trim();
  if (!kw) return [];
  const rows = await prisma.user.findMany({
    where: { organizationId: ctx.organizationId, name: { contains: kw, mode: "insensitive" }, role: { in: ["FIELD_EXECUTIVE", "DATA_MANAGER", "ADMIN"] } },
    select: { id: true, name: true, role: true, phone: true },
    take: PER_ENTITY_LIMIT,
  });
  return rows.map((e) => ({ entity: "EMPLOYEE", id: e.id, title: e.name, subtitle: `${e.role.replace(/_/g, " ")} · ${e.phone}`, href: `/employees/${e.id}` }));
}

async function searchVisits(parsed: ReturnType<typeof parseSearchQuery>, ctx: SearchContext): Promise<SearchResultItem[]> {
  const scopedAssignedToId = ctx.role === "FIELD_EXECUTIVE" ? ctx.userId : undefined;
  const where: Record<string, unknown> = { organizationId: ctx.organizationId, ...(scopedAssignedToId ? { assignedToId: scopedAssignedToId } : {}) };
  if (parsed.dateFilter === "TODAY") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    where.visitDate = { gte: start, lte: end };
  }
  const kw = parsed.keywords.join(" ").trim();
  if (kw) where.OR = [{ lead: { clientName: { contains: kw, mode: "insensitive" } } }, { property: { title: { contains: kw, mode: "insensitive" } } }];

  const rows = await prisma.visit.findMany({
    where,
    select: { id: true, leadId: true, visitDate: true, visitTime: true, status: true, lead: { select: { clientName: true } }, property: { select: { title: true } } },
    take: PER_ENTITY_LIMIT,
    orderBy: { visitDate: "desc" },
  });
  return rows.map((v) => ({ entity: "VISIT", id: v.id, title: `${v.lead.clientName} - ${v.property.title}`, subtitle: `${v.visitDate.toLocaleDateString("en-IN")} at ${v.visitTime}`, href: `/leads/${v.leadId}`, badge: v.status }));
}

async function searchFollowUps(parsed: ReturnType<typeof parseSearchQuery>, ctx: SearchContext): Promise<SearchResultItem[]> {
  const scopedOwnerId = ctx.role === "FIELD_EXECUTIVE" ? ctx.userId : undefined;
  const where: Record<string, unknown> = { organizationId: ctx.organizationId, leadId: { not: null }, ...(scopedOwnerId ? { ownerId: scopedOwnerId } : {}) };
  if (parsed.dateFilter === "OVERDUE") where.status = "OVERDUE";
  if (parsed.dateFilter === "TODAY") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    where.dueDate = { gte: start, lte: end };
  }
  const kw = parsed.keywords.join(" ").trim();
  if (kw) where.lead = { clientName: { contains: kw, mode: "insensitive" } };

  const rows = await prisma.followUp.findMany({
    where,
    select: { id: true, type: true, dueDate: true, status: true, leadId: true, lead: { select: { clientName: true } } },
    take: PER_ENTITY_LIMIT,
    orderBy: { dueDate: "asc" },
  });
  return rows
    .filter((f) => f.lead)
    .map((f) => ({ entity: "FOLLOW_UP", id: f.id, title: `${f.type.replace(/_/g, " ")} - ${f.lead!.clientName}`, subtitle: `Due ${f.dueDate.toLocaleDateString("en-IN")}`, href: `/leads/${f.leadId}`, badge: f.status }));
}

async function searchDocuments(parsed: ReturnType<typeof parseSearchQuery>, ctx: SearchContext): Promise<SearchResultItem[]> {
  const kw = parsed.keywords.join(" ").trim();
  if (!kw) return [];
  const rows = await prisma.document.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null, fileName: { contains: kw, mode: "insensitive" } },
    select: { id: true, fileName: true, entityType: true, leadId: true, propertyId: true, dealId: true },
    take: PER_ENTITY_LIMIT,
    orderBy: { createdAt: "desc" },
  });
  return rows.map((d) => ({
    entity: "DOCUMENT",
    id: d.id,
    title: d.fileName,
    subtitle: d.entityType.replace(/_/g, " "),
    href: d.leadId ? `/leads/${d.leadId}` : d.propertyId ? `/properties/${d.propertyId}` : d.dealId ? `/deals/${d.dealId}` : "/documents",
  }));
}

async function searchDeals(parsed: ReturnType<typeof parseSearchQuery>, ctx: SearchContext): Promise<SearchResultItem[]> {
  const kw = parsed.keywords.join(" ").trim();
  if (!kw) return [];
  const rows = await prisma.deal.findMany({
    where: { organizationId: ctx.organizationId, dealCode: { contains: kw, mode: "insensitive" } },
    select: { id: true, dealCode: true, stage: true, status: true },
    take: PER_ENTITY_LIMIT,
  });
  return rows.map((d) => ({ entity: "DEAL", id: d.id, title: d.dealCode, subtitle: d.stage.replace(/_/g, " "), href: `/deals/${d.id}`, badge: d.status }));
}

async function searchPayments(parsed: ReturnType<typeof parseSearchQuery>, ctx: SearchContext): Promise<SearchResultItem[]> {
  const kw = parsed.keywords.join(" ").trim();
  if (!kw) return [];
  const rows = await prisma.payment.findMany({
    where: { organizationId: ctx.organizationId, OR: [{ receiptNumber: { contains: kw, mode: "insensitive" } }, { deal: { dealCode: { contains: kw, mode: "insensitive" } } }] },
    select: { id: true, amount: true, status: true, dealId: true, deal: { select: { dealCode: true } } },
    take: PER_ENTITY_LIMIT,
  });
  return rows.map((p) => ({ entity: "PAYMENT", id: p.id, title: `₹${p.amount.toLocaleString("en-IN")} - ${p.deal.dealCode}`, subtitle: p.status, href: `/deals/${p.dealId}`, badge: p.status }));
}

async function searchCatalogues(parsed: ReturnType<typeof parseSearchQuery>, ctx: SearchContext): Promise<SearchResultItem[]> {
  const kw = parsed.keywords.join(" ").trim();
  if (!kw) return [];
  const rows = await prisma.catalogueShare.findMany({
    where: { organizationId: ctx.organizationId, title: { contains: kw, mode: "insensitive" } },
    select: { id: true, title: true, status: true, leadId: true, lead: { select: { clientName: true } } },
    take: PER_ENTITY_LIMIT,
  });
  return rows.map((c) => ({ entity: "CATALOGUE", id: c.id, title: c.title, subtitle: c.lead.clientName, href: `/leads/${c.leadId}`, badge: c.status }));
}

async function searchNotifications(parsed: ReturnType<typeof parseSearchQuery>, ctx: SearchContext): Promise<SearchResultItem[]> {
  const kw = parsed.keywords.join(" ").trim();
  if (!kw) return [];
  const rows = await prisma.notification.findMany({
    where: { ...notificationVisibilityWhere(ctx.userId, ctx.role), OR: [{ title: { contains: kw, mode: "insensitive" } }, { message: { contains: kw, mode: "insensitive" } }] },
    select: { id: true, title: true, message: true, leadId: true, propertyId: true, createdAt: true },
    take: PER_ENTITY_LIMIT,
    orderBy: { createdAt: "desc" },
  });
  return rows.map((n) => ({ entity: "NOTIFICATION", id: n.id, title: n.title, subtitle: n.message, href: n.leadId ? `/leads/${n.leadId}` : n.propertyId ? `/properties/${n.propertyId}` : "/notifications" }));
}

const ENTITY_SEARCHERS: Record<SearchEntityType, (parsed: ReturnType<typeof parseSearchQuery>, ctx: SearchContext) => Promise<SearchResultItem[]>> = {
  LEAD: searchLeads,
  PROPERTY: searchProperties,
  EMPLOYEE: searchEmployees,
  VISIT: searchVisits,
  FOLLOW_UP: searchFollowUps,
  DOCUMENT: searchDocuments,
  DEAL: searchDeals,
  PAYMENT: searchPayments,
  CATALOGUE: searchCatalogues,
  NOTIFICATION: searchNotifications,
};

/** Runs the search: parses the query, then queries only the relevant entity/entities (bounded, org/role-scoped). */
export async function runGlobalSearch(rawQuery: string, ctx: SearchContext): Promise<SearchResponse> {
  const parsed = parseSearchQuery(rawQuery);
  if (!parsed.raw.trim()) return { query: parsed, results: [], totalCount: 0 };

  const entityTypes: SearchEntityType[] = parsed.entity ? [parsed.entity] : (Object.keys(ENTITY_SEARCHERS) as SearchEntityType[]);
  const groups = await Promise.all(entityTypes.map((e) => ENTITY_SEARCHERS[e](parsed, ctx)));
  const results = groups.flat().slice(0, TOTAL_LIMIT);

  return { query: parsed, results, totalCount: results.length };
}
