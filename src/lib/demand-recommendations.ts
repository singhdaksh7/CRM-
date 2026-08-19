import "server-only";
import type { Property, CustomerContact, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getSystemConfig } from "./system-config";
import {
  scoreDemandCandidate,
  normalizeCustomerRequirement,
  normalizeLeadRequirement,
  leadIsMatchEligible,
  candidateKeyFor,
  type MatchTierConfig,
  type DemandMatchResult,
  type NormalizedRequirement,
} from "./demand-matching";

/**
 * DB-touching orchestration for the two-way matching engine in
 * demand-matching.ts (which stays pure/DB-free and is unit-tested directly).
 * Bounded, server-side-prefiltered, and idempotent (rule 40/41/42):
 * candidates are narrowed in SQL (organizationId, active/contactable flags,
 * asset class, transaction type, and a budget lower-bound derived from the
 * requested property's price and the org's stretch tolerance) before ever
 * being scored in application code, and every write is an upsert keyed on
 * (organizationId, propertyId, candidateKey) so recomputation never
 * duplicates a row. Nothing here ever sets a recommendation to SENT - see
 * ZERO AUTO-SEND; this module only ever produces/refreshes PENDING rows.
 */

function getListingPrice(property: Pick<Property, "listingType" | "monthlyRent" | "salePrice">): number {
  return property.listingType === "RENT" ? property.monthlyRent ?? 0 : property.salePrice ?? 0;
}

function isStale(lastConfirmedAt: Date, staleAfterDays: number): boolean {
  const ageMs = Date.now() - lastConfirmedAt.getTime();
  return ageMs > staleAfterDays * 24 * 60 * 60 * 1000;
}

async function tierConfigFor(organizationId: string): Promise<MatchTierConfig & { staleAfterDays: number }> {
  const config = await getSystemConfig(organizationId);
  return { budgetStretchPct: config.propertyMatchBudgetStretchPct, staleAfterDays: config.requirementStaleAfterDays };
}

/** Minimum maxBudget a requirement must have to even be worth scoring against this property's price, given the stretch tolerance - real SQL-level prefiltering, not a JS full-table scan (rule 40). */
function minAcceptableMaxBudget(price: number, stretchPct: number): number {
  return price / (1 + stretchPct);
}

/**
 * Direction A (rule 12): find every CustomerRequirement/Lead that matches a
 * given Property, and upsert a PropertyRecommendation row per match. Called
 * on property create/material-update (enqueued by the caller - this
 * function itself does the bounded work synchronously since it is already
 * narrow/indexed; see rule 41 "prefer enqueue/bounded async").
 */
export async function recomputeMatchesForProperty(propertyId: string, organizationId: string) {
  const property = await prisma.property.findFirst({ where: { id: propertyId, organizationId } });
  if (!property) return { created: 0, updated: 0 };
  const { budgetStretchPct, staleAfterDays } = await tierConfigFor(organizationId);
  const config: MatchTierConfig = { budgetStretchPct };
  const price = getListingPrice(property);
  const minBudget = price > 0 ? minAcceptableMaxBudget(price, budgetStretchPct) : 0;

  const [requirements, leads] = await Promise.all([
    prisma.customerRequirement.findMany({
      where: {
        organizationId,
        active: true,
        assetClass: property.assetClass,
        transactionType: property.listingType,
        OR: [{ maxBudget: null }, { maxBudget: { gte: minBudget } }],
        customerContact: { doNotContact: false, whatsAppOptOut: false, status: { notIn: ["DO_NOT_CONTACT", "ARCHIVED"] } },
      },
      include: { customerContact: { select: { id: true, doNotContact: true, whatsAppOptOut: true, status: true } } },
    }),
    prisma.lead.findMany({
      where: {
        organizationId,
        assetClass: property.assetClass,
        transactionType: property.listingType,
        status: { notIn: ["CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"] },
        maxBudget: { gte: minBudget },
      },
    }),
  ]);

  const normalized: NormalizedRequirement[] = [
    ...requirements
      .filter((r) => !isStale(r.lastConfirmedAt, staleAfterDays))
      .map((r) => normalizeCustomerRequirement(r, r.customerContact, isStale(r.lastConfirmedAt, staleAfterDays))),
    ...leads.filter(leadIsMatchEligible).map(normalizeLeadRequirement),
  ];

  let created = 0;
  let updated = 0;
  for (const requirement of normalized) {
    const result = scoreDemandCandidate(property, requirement, config);
    if (!result) continue;
    const wrote = await upsertRecommendation(organizationId, property.id, requirement, result);
    if (wrote === "created") created++;
    else updated++;
  }
  return { created, updated };
}

/**
 * Direction B (rule 11): find every AVAILABLE property matching one
 * CustomerRequirement, and upsert a PropertyRecommendation row per match.
 */
export async function recomputeMatchesForRequirement(requirementId: string, organizationId: string) {
  const requirementRow = await prisma.customerRequirement.findFirst({
    where: { id: requirementId, organizationId },
    include: { customerContact: { select: { id: true, doNotContact: true, whatsAppOptOut: true, status: true } } },
  });
  if (!requirementRow) return { created: 0, updated: 0 };
  const { budgetStretchPct, staleAfterDays } = await tierConfigFor(organizationId);
  const config: MatchTierConfig = { budgetStretchPct };
  const stale = isStale(requirementRow.lastConfirmedAt, staleAfterDays);
  const requirement = normalizeCustomerRequirement(requirementRow, requirementRow.customerContact, stale);
  if (!requirement.contactable) return { created: 0, updated: 0 };

  const maxPrice = requirement.maxBudget ? requirement.maxBudget * (1 + budgetStretchPct) : undefined;
  const priceField = requirement.transactionType === "RENT" ? "monthlyRent" : "salePrice";
  const where: Prisma.PropertyWhereInput = {
    organizationId,
    assetClass: requirement.assetClass,
    listingType: requirement.transactionType,
    status: "AVAILABLE",
    ...(maxPrice ? { [priceField]: { lte: maxPrice } } : {}),
  };
  const properties = await prisma.property.findMany({ where });

  let created = 0;
  let updated = 0;
  for (const property of properties) {
    const result = scoreDemandCandidate(property, requirement, config);
    if (!result) continue;
    const wrote = await upsertRecommendation(organizationId, property.id, requirement, result);
    if (wrote === "created") created++;
    else updated++;
  }
  return { created, updated };
}

async function upsertRecommendation(organizationId: string, propertyId: string, requirement: NormalizedRequirement, result: DemandMatchResult): Promise<"created" | "updated"> {
  const candidateKey = candidateKeyFor(requirement);
  const existing = await prisma.propertyRecommendation.findUnique({
    where: { organizationId_propertyId_candidateKey: { organizationId, propertyId, candidateKey } },
  });
  const data = {
    tier: result.tier,
    score: result.score,
    reasons: JSON.stringify(result.reasons.map((r) => `${r.matched ? "✓" : "⚠"} ${r.detail}`)),
  };
  if (existing) {
    // Never touch status/preparedAt/sentAt/response* on recompute - a human
    // decision (PREPARED/SENT/IGNORED/response) must never be silently
    // reset by a background rescore (rule 42 lifecycle, ZERO AUTO-SEND).
    await prisma.propertyRecommendation.update({ where: { id: existing.id }, data });
    return "updated";
  }
  await prisma.propertyRecommendation.create({
    data: {
      organizationId,
      propertyId,
      source: requirement.source,
      candidateKey,
      customerContactId: requirement.source === "CONTACT" ? requirement.candidateId : null,
      leadId: requirement.source === "LEAD" ? requirement.candidateId : null,
      requirementId: requirement.requirementId,
      ...data,
    },
  });
  return "created";
}

export interface ContactFrequencyWarning {
  candidateKey: string;
  reason: "CONTACTED_RECENTLY" | "PROPERTY_ALREADY_SENT" | "OPTED_OUT" | "DO_NOT_CONTACT";
}

/**
 * Rule 21 (contact frequency safety): given the recommendation rows a user
 * is about to act on, returns which ones should be flagged/excluded before
 * sending - never auto-excludes on the caller's behalf, just reports so the
 * UI can warn or let an Admin override. Pure/no side effects.
 */
export function contactFrequencyWarnings(
  candidates: Array<{
    candidateKey: string;
    contact: Pick<CustomerContact, "doNotContact" | "whatsAppOptOut" | "lastContactedAt" | "lastPropertySentAt"> | null;
    alreadySentThisProperty: boolean;
  }>,
  minimumDaysBetween: number
): ContactFrequencyWarning[] {
  const warnings: ContactFrequencyWarning[] = [];
  const cutoff = Date.now() - minimumDaysBetween * 24 * 60 * 60 * 1000;
  for (const candidate of candidates) {
    if (candidate.alreadySentThisProperty) { warnings.push({ candidateKey: candidate.candidateKey, reason: "PROPERTY_ALREADY_SENT" }); continue; }
    if (candidate.contact?.doNotContact) { warnings.push({ candidateKey: candidate.candidateKey, reason: "DO_NOT_CONTACT" }); continue; }
    if (candidate.contact?.whatsAppOptOut) { warnings.push({ candidateKey: candidate.candidateKey, reason: "OPTED_OUT" }); continue; }
    if (candidate.contact?.lastContactedAt && candidate.contact.lastContactedAt.getTime() > cutoff) {
      warnings.push({ candidateKey: candidate.candidateKey, reason: "CONTACTED_RECENTLY" });
    }
  }
  return warnings;
}
