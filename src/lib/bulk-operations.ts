import { prisma } from "./prisma";
import { recordAudit } from "./audit";
import { matchPropertiesToLead } from "./matching";
import { createCatalogue } from "./catalogues";
import type { LeadStatus, PropertyStatus, FollowUpType, Role } from "@prisma/client";

/**
 * Shared bulk-operation runner: applies `fn` to each id in turn, catching
 * per-item failures so one bad row never aborts the whole batch - this is
 * the "partial success reporting" every bulk action needs. Capped at
 * MAX_BULK_SIZE so a single request can never trigger an unbounded number
 * of writes.
 */
export interface BulkItemResult {
  id: string;
  success: boolean;
  error?: string;
}

export interface BulkResult {
  total: number;
  succeeded: number;
  failed: number;
  results: BulkItemResult[];
}

const MAX_BULK_SIZE = 100;

async function runBulk(ids: string[], fn: (id: string) => Promise<void>): Promise<BulkResult> {
  const capped = ids.slice(0, MAX_BULK_SIZE);
  const results: BulkItemResult[] = [];
  for (const id of capped) {
    try {
      await fn(id);
      results.push({ id, success: true });
    } catch (err) {
      results.push({ id, success: false, error: err instanceof Error ? err.message : "Failed" });
    }
  }
  return { total: capped.length, succeeded: results.filter((r) => r.success).length, failed: results.filter((r) => !r.success).length, results };
}

export async function bulkAssignLeads(ids: string[], assignedToId: string, organizationId: string, actorUserId: string): Promise<BulkResult> {
  return runBulk(ids, async (id) => {
    const lead = await prisma.lead.findFirst({ where: { id, organizationId } });
    if (!lead) throw new Error("Lead not found");
    await prisma.lead.update({ where: { id }, data: { assignedToId } });
    await recordAudit({ userId: actorUserId, action: "UPDATE", entityType: "Lead", entityId: id, oldValues: { assignedToId: lead.assignedToId }, newValues: { assignedToId } });
  });
}

export async function bulkUpdateLeadStatus(ids: string[], status: LeadStatus, organizationId: string, actorUserId: string): Promise<BulkResult> {
  return runBulk(ids, async (id) => {
    const lead = await prisma.lead.findFirst({ where: { id, organizationId } });
    if (!lead) throw new Error("Lead not found");
    await prisma.lead.update({ where: { id }, data: { status } });
    await recordAudit({ userId: actorUserId, action: "UPDATE", entityType: "Lead", entityId: id, oldValues: { status: lead.status }, newValues: { status } });
  });
}

export async function bulkScheduleFollowUp(ids: string[], type: FollowUpType, dueDate: Date, organizationId: string, actorUserId: string): Promise<BulkResult> {
  return runBulk(ids, async (id) => {
    const lead = await prisma.lead.findFirst({ where: { id, organizationId } });
    if (!lead) throw new Error("Lead not found");
    const followUp = await prisma.followUp.create({
      data: { organizationId, leadId: id, ownerId: lead.assignedToId, type, dueDate, status: "PENDING" },
    });
    await recordAudit({ userId: actorUserId, action: "CREATE", entityType: "FollowUp", entityId: followUp.id, newValues: { leadId: id, type, dueDate } });
  });
}

const CATALOGUE_MATCH_LIMIT = 5;

/** Generates a draft catalogue (best-matching available properties, capped) for each lead - reuses the existing matching engine and createCatalogue(), never re-implements either. */
export async function bulkGenerateCatalogues(ids: string[], organizationId: string, actorUserId: string, actorRole: Role): Promise<BulkResult> {
  return runBulk(ids, async (id) => {
    const lead = await prisma.lead.findFirst({ where: { id, organizationId } });
    if (!lead) throw new Error("Lead not found");
    const properties = await prisma.property.findMany({ where: { organizationId, status: "AVAILABLE" } });
    const matches = matchPropertiesToLead(properties, lead, 0.2).slice(0, CATALOGUE_MATCH_LIMIT);
    if (matches.length === 0) throw new Error("No matching properties found");

    const catalogue = await createCatalogue({
      leadId: id,
      organizationId,
      createdByUserId: actorUserId,
      createdByRole: actorRole,
      title: `Bulk catalogue - ${new Date().toLocaleDateString("en-IN")}`,
      includePrice: true,
      includeAddress: false,
      includeBrokerage: false,
      properties: matches.map((m, i) => ({ propertyId: m.property.id, sortOrder: i, priceVisible: true, addressVisible: false, brokerageVisible: false })),
    });
    await recordAudit({ userId: actorUserId, action: "CREATE", entityType: "CatalogueShare", entityId: catalogue.id, newValues: { leadId: id, propertyCount: matches.length } });
  });
}

export async function bulkUpdatePropertyAvailability(ids: string[], status: PropertyStatus, organizationId: string, actorUserId: string): Promise<BulkResult> {
  return runBulk(ids, async (id) => {
    const property = await prisma.property.findFirst({ where: { id, organizationId } });
    if (!property) throw new Error("Property not found");
    await prisma.property.update({ where: { id }, data: { status } });
    await recordAudit({ userId: actorUserId, action: "UPDATE", entityType: "Property", entityId: id, oldValues: { status: property.status }, newValues: { status } });
  });
}

export async function bulkVerifyPropertyOwners(ids: string[], organizationId: string, actorUserId: string): Promise<BulkResult> {
  return runBulk(ids, async (id) => {
    const property = await prisma.property.findFirst({ where: { id, organizationId }, include: { owner: true } });
    if (!property) throw new Error("Property not found");
    if (!property.ownerId) throw new Error("No owner linked to this property");
    await prisma.owner.update({ where: { id: property.ownerId }, data: { verificationStatus: "VERIFIED", verifiedAt: new Date(), verifiedById: actorUserId } });
    await recordAudit({ userId: actorUserId, action: "UPDATE", entityType: "Owner", entityId: property.ownerId, oldValues: { verificationStatus: property.owner?.verificationStatus }, newValues: { verificationStatus: "VERIFIED" } });
  });
}

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

export async function bulkAddPropertyTags(ids: string[], tags: string[], organizationId: string, actorUserId: string): Promise<BulkResult> {
  return runBulk(ids, async (id) => {
    const property = await prisma.property.findFirst({ where: { id, organizationId } });
    if (!property) throw new Error("Property not found");
    const merged = Array.from(new Set([...parseTags(property.tags), ...tags]));
    await prisma.property.update({ where: { id }, data: { tags: JSON.stringify(merged) } });
    await recordAudit({ userId: actorUserId, action: "UPDATE", entityType: "Property", entityId: id, oldValues: { tags: property.tags }, newValues: { tags: merged } });
  });
}

export async function bulkManageInventory(params: {
  ids: string[]; organizationId: string; actorUserId: string;
  action: "PARTNER" | "NEEDS_VERIFICATION" | "LOCALITY" | "PRICE";
  partnerId?: string; area?: string; priceMode?: "SET" | "PERCENT"; priceValue?: number;
}): Promise<BulkResult> {
  const properties = await prisma.property.findMany({ where: { id: { in: params.ids }, organizationId: params.organizationId } });
  if (params.action === "PARTNER") {
    if (!params.partnerId) throw new Error("Choose an inventory partner");
    const partner = await prisma.inventoryPartner.findFirst({ where: { id: params.partnerId, organizationId: params.organizationId, isActive: true } });
    if (!partner) throw new Error("Inventory partner not found");
  }
  const results: BulkResult["results"] = [];
  const timeline: { organizationId: string; propertyId: string; eventType: string; fromValue?: string | null; toValue?: string | null; note?: string; actorId: string }[] = [];
  await prisma.$transaction(async (tx) => {
    for (const property of properties) {
      try {
        if (params.action === "PARTNER") {
          if (property.inventorySource !== "INDIRECT") throw new Error("Inventory Partner applies only to INDIRECT properties");
          await tx.property.update({ where: { id: property.id }, data: { partnerId: params.partnerId } });
          timeline.push({ organizationId: params.organizationId, propertyId: property.id, eventType: "BULK_PARTNER_UPDATED", fromValue: property.partnerId, toValue: params.partnerId, actorId: params.actorUserId });
        } else if (params.action === "NEEDS_VERIFICATION") {
          await tx.property.update({ where: { id: property.id }, data: { pendingVerification: true } });
          timeline.push({ organizationId: params.organizationId, propertyId: property.id, eventType: "BULK_NEEDS_VERIFICATION", actorId: params.actorUserId });
        } else if (params.action === "LOCALITY") {
          if (!params.area?.trim()) throw new Error("Locality is required");
          await tx.property.update({ where: { id: property.id }, data: { area: params.area.trim() } });
          timeline.push({ organizationId: params.organizationId, propertyId: property.id, eventType: "BULK_LOCALITY_UPDATED", fromValue: property.area, toValue: params.area.trim(), actorId: params.actorUserId });
        } else {
          const oldPrice = property.listingType === "RENT" ? property.monthlyRent : property.salePrice;
          if (oldPrice == null && params.priceMode === "PERCENT") throw new Error("Cannot adjust a blank price by percentage");
          const next = params.priceMode === "SET" ? params.priceValue! : Math.round(oldPrice! * (1 + params.priceValue! / 100));
          if (!Number.isFinite(next) || next <= 0) throw new Error("Price result must be positive");
          await tx.property.update({ where: { id: property.id }, data: property.listingType === "RENT" ? { monthlyRent: next } : { salePrice: next } });
          timeline.push({ organizationId: params.organizationId, propertyId: property.id, eventType: "BULK_PRICE_UPDATED", fromValue: String(oldPrice ?? ""), toValue: String(next), actorId: params.actorUserId });
        }
        results.push({ id: property.id, success: true });
      } catch (error) { results.push({ id: property.id, success: false, error: error instanceof Error ? error.message : "Update failed" }); }
    }
    if (timeline.length) await tx.propertyTimelineEvent.createMany({ data: timeline });
  });
  for (const missing of params.ids.filter((id) => !properties.some((property) => property.id === id))) results.push({ id: missing, success: false, error: "Property not found in this organization" });
  await recordAudit({ userId: params.actorUserId, action: "UPDATE", entityType: "PropertyBulkUpdate", newValues: { event: "BULK_PROPERTY_UPDATE", action: params.action, requested: params.ids.length, succeeded: results.filter((result) => result.success).length } });
  return { total: params.ids.length, succeeded: results.filter((result) => result.success).length, failed: results.filter((result) => !result.success).length, results };
}
