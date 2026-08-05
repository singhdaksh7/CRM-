import { prisma } from "../prisma";
import { cached } from "../cache";
import { buildHealthScore, daysBetween } from "./rule-engine";
import type { HealthFactor, HealthLabel, HealthScoreResult } from "./types";
import type { PropertyStatus, OwnerVerificationStatus } from "@prisma/client";

/**
 * Property Health measures listing quality and operational freshness -
 * whether the listing is complete, verified, and actively working (getting
 * matches/shares/visits) rather than sitting stale. Not a market-value
 * estimate; no external comparable data is used anywhere in this file.
 */
export interface PropertyHealthInput {
  status: PropertyStatus;
  hasOwner: boolean;
  ownerVerificationStatus: OwnerVerificationStatus | null;
  hasCompleteAddress: boolean;
  hasPrice: boolean;
  imageCount: number;
  hasCoverImage: boolean;
  updatedAt: Date;
  recentLeadMatchesCount: number;
  recentCatalogueShareCount: number;
  recentVisitCount: number;
  recentRejectionCount: number;
  now?: Date;
}

const STALE_AVAILABILITY_DAYS = 30;

/** Pure, deterministic - no I/O, fully unit-testable. */
export function computePropertyHealth(input: PropertyHealthInput): HealthScoreResult {
  const now = input.now ?? new Date();
  const factors: HealthFactor[] = [];

  if (input.status === "AVAILABLE") {
    factors.push({ label: "Active listing", delta: 8, detail: "Listed as available" });
  } else if (input.status === "INACTIVE") {
    factors.push({ label: "Inactive listing", delta: -10, detail: "Listing is marked inactive" });
  }

  if (!input.hasOwner) {
    factors.push({ label: "No owner linked", delta: -15, detail: "No owner record linked to this listing - link an owner" });
  } else if (input.ownerVerificationStatus === "VERIFIED") {
    factors.push({ label: "Owner verified", delta: 10, detail: "Owner identity is verified" });
  } else {
    factors.push({ label: "Owner not verified", delta: -8, detail: "Owner is not yet verified - verify owner" });
  }

  if (input.hasCompleteAddress) {
    factors.push({ label: "Complete address", delta: 6, detail: "Address, area and city are all on file" });
  } else {
    factors.push({ label: "Incomplete address", delta: -8, detail: "Address details are incomplete" });
  }

  if (input.hasPrice) {
    factors.push({ label: "Valid price", delta: 6, detail: "Price is set for this listing type" });
  } else {
    factors.push({ label: "Missing price", delta: -15, detail: "Price is not set - add a price" });
  }

  if (input.imageCount === 0) {
    factors.push({ label: "No images", delta: -20, detail: "No images uploaded - add photos" });
  } else if (input.imageCount >= 5) {
    factors.push({ label: "Good image coverage", delta: 12, detail: `${input.imageCount} photos uploaded` });
  } else {
    factors.push({ label: "Some images", delta: 5, detail: `${input.imageCount} photo${input.imageCount > 1 ? "s" : ""} uploaded - add more for full coverage` });
  }

  if (input.hasCoverImage) {
    factors.push({ label: "Cover image set", delta: 4, detail: "A cover image is set" });
  }

  const daysSinceUpdate = daysBetween(input.updatedAt, now);
  if (input.status === "AVAILABLE" && daysSinceUpdate > STALE_AVAILABILITY_DAYS) {
    factors.push({ label: "Stale availability", delta: -12, detail: `No update in ${daysSinceUpdate} days - confirm this listing is still available` });
  } else if (input.status === "AVAILABLE" && daysSinceUpdate <= 7) {
    factors.push({ label: "Recently confirmed", delta: 5, detail: "Listing was updated recently" });
  }

  if (input.recentLeadMatchesCount > 0) {
    factors.push({ label: "Recent lead matches", delta: 8, detail: `Matched ${input.recentLeadMatchesCount} active lead(s) currently` });
  } else if (input.status === "AVAILABLE") {
    factors.push({ label: "No recent matches", delta: -8, detail: "No active leads currently match this property" });
  }

  if (input.recentCatalogueShareCount > 0) {
    factors.push({ label: "Recently shared", delta: 5, detail: `Included in ${input.recentCatalogueShareCount} catalogue share(s) in the last 30 days` });
  }

  if (input.recentVisitCount > 0) {
    factors.push({ label: "Recent visit activity", delta: 6, detail: `${input.recentVisitCount} visit(s) in the last 30 days` });
  }

  if (input.recentRejectionCount >= 2) {
    factors.push({ label: "Multiple client rejections", delta: -10, detail: `${input.recentRejectionCount} clients marked "not interested" recently - review price or condition` });
  }

  const fallback = "Listing is in good health - no action needed right now.";

  return buildHealthScore(factors, 50, fallback);
}

const RECENT_WINDOW_DAYS = 30;

/** Orchestration: loads what computePropertyHealth needs and returns the result. */
export async function getPropertyHealth(propertyId: string): Promise<HealthScoreResult | null> {
  const property = await prisma.property.findUnique({ where: { id: propertyId }, include: { owner: true } });
  if (!property) return null;

  const since = new Date();
  since.setDate(since.getDate() - RECENT_WINDOW_DAYS);

  const [recentVisitCount, recentCatalogueShareCount, recentRejectionCount, activeLeadCount] = await Promise.all([
    prisma.visit.count({ where: { propertyId, createdAt: { gte: since } } }),
    prisma.catalogueShareProperty.count({ where: { propertyId, createdAt: { gte: since } } }),
    prisma.catalogueInteraction.count({ where: { propertyId, type: "NOT_INTERESTED", createdAt: { gte: since } } }),
    // Cheap proxy for "recent lead matches": active, early-pipeline leads in
    // the same locality and requirement type. Running the full scoring
    // matching algorithm per property on every page load does not scale;
    // this locality+type filter is a bounded, indexed approximation.
    prisma.lead.count({
      where: {
        organizationId: property.organizationId,
        preferredLocation: { equals: property.area, mode: "insensitive" },
        requirementType: property.listingType === "RENT" ? "RENT" : "BUY",
        status: { notIn: ["CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"] },
        maxBudget: { gte: property.listingType === "RENT" ? (property.monthlyRent ?? 0) * 0.7 : (property.salePrice ?? 0) * 0.7 },
      },
    }),
  ]);

  const images: string[] = (() => {
    try {
      return JSON.parse(property.images || "[]");
    } catch {
      return [];
    }
  })();

  const hasPrice = property.listingType === "RENT" ? Boolean(property.monthlyRent && property.monthlyRent > 0) : Boolean(property.salePrice && property.salePrice > 0);

  return computePropertyHealth({
    status: property.status,
    hasOwner: Boolean(property.ownerId || property.owner),
    ownerVerificationStatus: property.owner?.verificationStatus ?? null,
    hasCompleteAddress: Boolean(property.address?.trim() && property.area?.trim() && property.city?.trim()),
    hasPrice,
    imageCount: images.length,
    hasCoverImage: Boolean(property.coverImage),
    updatedAt: property.updatedAt,
    recentLeadMatchesCount: activeLeadCount,
    recentCatalogueShareCount,
    recentVisitCount,
    recentRejectionCount,
  });
}

const OVERVIEW_PROPERTY_LIMIT = 200;

/**
 * Dashboard-scale health distribution across the active portfolio. Bounded
 * to OVERVIEW_PROPERTY_LIMIT properties with a fixed, small number of
 * groupBy queries (never one query per property). The "recent lead
 * matches" factor uses an in-memory locality+type+budget bucket built from
 * one bulk lead query, rather than one lead.count query per property.
 */
export async function getPropertyHealthOverview(organizationId: string): Promise<{ label: HealthLabel; count: number }[]> {
  return cached(`property-health-overview:${organizationId}`, 60, () => computePropertyHealthOverview(organizationId));
}

async function computePropertyHealthOverview(organizationId: string): Promise<{ label: HealthLabel; count: number }[]> {
  const properties = await prisma.property.findMany({
    where: { organizationId, status: { not: "INACTIVE" } },
    include: { owner: { select: { verificationStatus: true } } },
    take: OVERVIEW_PROPERTY_LIMIT,
  });
  if (properties.length === 0) return [];

  const propertyIds = properties.map((p) => p.id);
  const since = new Date();
  since.setDate(since.getDate() - RECENT_WINDOW_DAYS);

  const [visitGroups, shareGroups, rejectionGroups, activeLeads] = await Promise.all([
    prisma.visit.groupBy({ by: ["propertyId"], where: { propertyId: { in: propertyIds }, createdAt: { gte: since } }, _count: true }),
    prisma.catalogueShareProperty.groupBy({ by: ["propertyId"], where: { propertyId: { in: propertyIds }, createdAt: { gte: since } }, _count: true }),
    prisma.catalogueInteraction.groupBy({ by: ["propertyId"], where: { propertyId: { in: propertyIds }, type: "NOT_INTERESTED", createdAt: { gte: since } }, _count: true }),
    prisma.lead.findMany({
      where: { organizationId, status: { notIn: ["CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"] } },
      select: { preferredLocation: true, requirementType: true, maxBudget: true },
    }),
  ]);

  const visitByProperty = new Map(visitGroups.map((g) => [g.propertyId, g._count]));
  const shareByProperty = new Map(shareGroups.map((g) => [g.propertyId, g._count]));
  const rejectionByProperty = new Map(rejectionGroups.filter((g) => g.propertyId).map((g) => [g.propertyId as string, g._count]));

  const leadBucket = new Map<string, number[]>();
  for (const lead of activeLeads) {
    const key = `${lead.preferredLocation.toLowerCase()}|${lead.requirementType}`;
    if (!leadBucket.has(key)) leadBucket.set(key, []);
    leadBucket.get(key)!.push(lead.maxBudget);
  }

  const counts = new Map<HealthLabel, number>();
  for (const property of properties) {
    const images: string[] = (() => {
      try {
        return JSON.parse(property.images || "[]");
      } catch {
        return [];
      }
    })();
    const hasPrice = property.listingType === "RENT" ? Boolean(property.monthlyRent && property.monthlyRent > 0) : Boolean(property.salePrice && property.salePrice > 0);
    const price = property.listingType === "RENT" ? property.monthlyRent ?? 0 : property.salePrice ?? 0;
    const key = `${property.area.toLowerCase()}|${property.listingType === "RENT" ? "RENT" : "BUY"}`;
    const matchingLeadCount = (leadBucket.get(key) ?? []).filter((budget) => budget >= price * 0.7).length;

    const result = computePropertyHealth({
      status: property.status,
      hasOwner: Boolean(property.ownerId || property.owner),
      ownerVerificationStatus: property.owner?.verificationStatus ?? null,
      hasCompleteAddress: Boolean(property.address?.trim() && property.area?.trim() && property.city?.trim()),
      hasPrice,
      imageCount: images.length,
      hasCoverImage: Boolean(property.coverImage),
      updatedAt: property.updatedAt,
      recentLeadMatchesCount: matchingLeadCount,
      recentCatalogueShareCount: shareByProperty.get(property.id) ?? 0,
      recentVisitCount: visitByProperty.get(property.id) ?? 0,
      recentRejectionCount: rejectionByProperty.get(property.id) ?? 0,
    });
    counts.set(result.label, (counts.get(result.label) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([label, count]) => ({ label, count }));
}
