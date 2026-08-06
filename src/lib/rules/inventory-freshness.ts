import { prisma } from "../prisma";
import { cached } from "../cache";
import { getSystemConfig } from "../system-config";
import { daysBetween } from "./rule-engine";

/**
 * Inventory Freshness (Phase 4) - "when did we last actually confirm this
 * listing is real," distinct from Property Health ("how good is this
 * listing overall"). Both read overlapping signals but answer different
 * questions, per the product requirement's own framing. This is the
 * headline new feature of Phase 4 - Manager Dashboard surfaces a count like
 * "47 properties need verification" from getInventoryFreshnessOverview.
 */
export type FreshnessLabel = "FRESH" | "VERIFIED" | "NEEDS_VERIFICATION" | "STALE";

export interface InventoryFreshnessInput {
  lastVisitAt: Date | null;
  updatedAt: Date;
  lastVerifiedAt: Date | null;
  now?: Date;
}

export interface FreshnessThresholds {
  /** Days since the most recent signal (verify/visit/update) before VERIFIED becomes NEEDS_VERIFICATION. */
  needsVerificationDays: number;
  /** Days since the most recent signal before NEEDS_VERIFICATION becomes STALE. */
  staleDays: number;
}

const FRESH_WINDOW_DAYS = 7;

function mostRecent(...dates: (Date | null)[]): Date {
  const valid = dates.filter((d): d is Date => d !== null);
  return valid.reduce((latest, d) => (d.getTime() > latest.getTime() ? d : latest), valid[0]);
}

/**
 * Pure, deterministic - no I/O, fully unit-testable.
 * FRESH always wins when lastVerifiedAt is within FRESH_WINDOW_DAYS - an
 * explicit "I confirmed this today" action should read as fresher than a
 * property that merely had a visit or an unrelated field edit recently.
 */
export function computeInventoryFreshness(input: InventoryFreshnessInput, thresholds: FreshnessThresholds): FreshnessLabel {
  const now = input.now ?? new Date();

  if (input.lastVerifiedAt && daysBetween(input.lastVerifiedAt, now) <= FRESH_WINDOW_DAYS) {
    return "FRESH";
  }

  const signal = mostRecent(input.lastVerifiedAt, input.lastVisitAt, input.updatedAt);
  const daysSinceSignal = daysBetween(signal, now);

  if (daysSinceSignal <= thresholds.needsVerificationDays) return "VERIFIED";
  if (daysSinceSignal <= thresholds.staleDays) return "NEEDS_VERIFICATION";
  return "STALE";
}

/** Orchestration: loads what computeInventoryFreshness needs for a single property. */
export async function getInventoryFreshness(propertyId: string): Promise<FreshnessLabel | null> {
  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { organizationId: true, updatedAt: true, lastVerifiedAt: true } });
  if (!property) return null;

  const [config, lastVisit] = await Promise.all([
    getSystemConfig(property.organizationId),
    prisma.visit.findFirst({ where: { propertyId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);

  return computeInventoryFreshness(
    { lastVisitAt: lastVisit?.createdAt ?? null, updatedAt: property.updatedAt, lastVerifiedAt: property.lastVerifiedAt },
    { needsVerificationDays: config.freshnessNeedsVerificationDays, staleDays: config.freshnessStaleDays }
  );
}

const OVERVIEW_PROPERTY_LIMIT = 200;

/**
 * Dashboard-scale freshness distribution across the active portfolio.
 * Bounded to OVERVIEW_PROPERTY_LIMIT properties with a fixed, small number
 * of groupBy queries (never one query per property) - same shape as
 * getPropertyHealthOverview.
 */
export async function getInventoryFreshnessOverview(organizationId: string): Promise<{ label: FreshnessLabel; count: number }[]> {
  return cached(`inventory-freshness-overview:${organizationId}`, 60, () => computeInventoryFreshnessOverview(organizationId));
}

async function computeInventoryFreshnessOverview(organizationId: string): Promise<{ label: FreshnessLabel; count: number }[]> {
  const config = await getSystemConfig(organizationId);
  const properties = await prisma.property.findMany({
    where: { organizationId, status: { not: "INACTIVE" } },
    select: { id: true, updatedAt: true, lastVerifiedAt: true },
    take: OVERVIEW_PROPERTY_LIMIT,
  });
  if (properties.length === 0) return [];

  const propertyIds = properties.map((p) => p.id);
  const visitGroups = await prisma.visit.groupBy({
    by: ["propertyId"],
    where: { propertyId: { in: propertyIds } },
    _max: { createdAt: true },
  });
  const lastVisitByProperty = new Map(visitGroups.map((g) => [g.propertyId, g._max.createdAt]));

  const thresholds: FreshnessThresholds = { needsVerificationDays: config.freshnessNeedsVerificationDays, staleDays: config.freshnessStaleDays };
  const counts = new Map<FreshnessLabel, number>();
  for (const property of properties) {
    const label = computeInventoryFreshness(
      { lastVisitAt: lastVisitByProperty.get(property.id) ?? null, updatedAt: property.updatedAt, lastVerifiedAt: property.lastVerifiedAt },
      thresholds
    );
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([label, count]) => ({ label, count }));
}
