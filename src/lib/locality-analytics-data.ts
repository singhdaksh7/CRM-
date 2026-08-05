import { prisma } from "./prisma";
import { cached } from "./cache";
import { withTiming } from "./perf";
import { getOrganizationId } from "./organization";

const LOCALITY_ANALYTICS_CACHE_TTL_SECONDS = 60;

export interface LocalityStat {
  locality: string;
  requestedCount: number;
  avgBudget: number;
  availableInventory: number;
  avgDaysToSell: number | null;
}

export interface LocalityAnalyticsData {
  mostRequested: LocalityStat[];
  highestBudget: LocalityStat[];
  fastestSelling: LocalityStat[];
  inventoryByBhk: { bhk: number; count: number }[];
  inventoryByBudgetBucket: { label: string; count: number }[];
  inventoryRentVsSale: { name: string; value: number }[];
}

export async function getLocalityAnalytics(): Promise<LocalityAnalyticsData> {
  const organizationId = getOrganizationId();
  return withTiming("localityAnalytics", "/reports/localities", () =>
    cached(`locality-analytics:${organizationId}`, LOCALITY_ANALYTICS_CACHE_TTL_SECONDS, () => computeLocalityAnalytics(organizationId))
  );
}

async function computeLocalityAnalytics(organizationId: string): Promise<LocalityAnalyticsData> {
  const [leadsByLocation, propertiesByArea, propertiesByBhk, propertiesAll, soldProperties] = await Promise.all([
    prisma.lead.groupBy({ by: ["preferredLocation"], _count: { _all: true }, _avg: { maxBudget: true } }),
    prisma.property.groupBy({ by: ["area"], _count: { _all: true }, where: { status: { in: ["AVAILABLE", "RESERVED"] } } }),
    prisma.property.groupBy({ by: ["bhk"], _count: { _all: true }, where: { status: { in: ["AVAILABLE", "RESERVED"] } } }),
    prisma.property.findMany({ select: { listingType: true, monthlyRent: true, salePrice: true } }),
    prisma.property.findMany({
      where: { organizationId, status: { in: ["SOLD", "RENTED"] } },
      select: { area: true, createdAt: true, updatedAt: true },
    }),
  ]);

  const inventoryByArea = new Map(propertiesByArea.map((p) => [p.area, p._count._all]));

  const soldByArea = new Map<string, number[]>();
  for (const p of soldProperties) {
    const days = (p.updatedAt.getTime() - p.createdAt.getTime()) / 864e5;
    soldByArea.set(p.area, [...(soldByArea.get(p.area) ?? []), days]);
  }

  const localityStats: LocalityStat[] = leadsByLocation.map((l) => {
    const days = soldByArea.get(l.preferredLocation);
    return {
      locality: l.preferredLocation,
      requestedCount: l._count._all,
      avgBudget: Math.round(l._avg.maxBudget ?? 0),
      availableInventory: inventoryByArea.get(l.preferredLocation) ?? 0,
      avgDaysToSell: days && days.length > 0 ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null,
    };
  });

  const mostRequested = [...localityStats].sort((a, b) => b.requestedCount - a.requestedCount).slice(0, 10);
  const highestBudget = [...localityStats].sort((a, b) => b.avgBudget - a.avgBudget).slice(0, 10);
  const fastestSelling = localityStats
    .filter((s) => s.avgDaysToSell !== null)
    .sort((a, b) => (a.avgDaysToSell ?? Infinity) - (b.avgDaysToSell ?? Infinity))
    .slice(0, 10);

  const budgetBuckets = [
    { label: "< 15k / < 50L", min: 0, max: 15000, maxSale: 5000000 },
    { label: "15k-25k / 50L-1Cr", min: 15000, max: 25000, maxSale: 10000000 },
    { label: "25k-40k / 1-2Cr", min: 25000, max: 40000, maxSale: 20000000 },
    { label: "> 40k / > 2Cr", min: 40000, max: Infinity, maxSale: Infinity },
  ];
  const inventoryByBudgetBucket = budgetBuckets.map((b) => ({
    label: b.label,
    count: propertiesAll.filter((p) => {
      const price = p.listingType === "RENT" ? p.monthlyRent ?? 0 : p.salePrice ?? 0;
      const min = p.listingType === "RENT" ? b.min : b.min * 250;
      const max = p.listingType === "RENT" ? b.max : b.maxSale;
      return price >= min && price < max;
    }).length,
  }));

  const rentCount = propertiesAll.filter((p) => p.listingType === "RENT").length;
  const saleCount = propertiesAll.filter((p) => p.listingType === "SALE").length;

  return {
    mostRequested,
    highestBudget,
    fastestSelling,
    inventoryByBhk: propertiesByBhk.map((b) => ({ bhk: b.bhk, count: b._count._all })).sort((a, b) => a.bhk - b.bhk),
    inventoryByBudgetBucket,
    inventoryRentVsSale: [
      { name: "Rent", value: rentCount },
      { name: "Sale", value: saleCount },
    ],
  };
}
