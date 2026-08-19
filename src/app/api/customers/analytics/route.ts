import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import type { AssetClass, PropertyType, TransactionType } from "@prisma/client";

const BUDGET_BANDS: { label: string; min: number; max: number }[] = [
  { label: "Under 25L", min: 0, max: 2_500_000 },
  { label: "25L-50L", min: 2_500_000, max: 5_000_000 },
  { label: "50L-1Cr", min: 5_000_000, max: 10_000_000 },
  { label: "1Cr-2Cr", min: 10_000_000, max: 20_000_000 },
  { label: "Above 2Cr", min: 20_000_000, max: Infinity },
];

function budgetBand(maxBudget: number | null): string | null {
  if (maxBudget == null) return null;
  return (BUDGET_BANDS.find((b) => maxBudget >= b.min && maxBudget < b.max) ?? BUDGET_BANDS[BUDGET_BANDS.length - 1]).label;
}

interface Bucket {
  locality: string;
  bhk: number | null;
  assetClass: AssetClass;
  transactionType: TransactionType;
  commercialSubtype: PropertyType | null;
  budgetBand: string | null;
  demand: number;
}

// GET /api/customers/analytics - real demand-vs-supply aggregation
// (locality x BHK/commercial-subtype x asset class x transaction type x
// budget band), computed from live CustomerRequirement + Property rows.
export async function GET() {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user.id);

    const requirements = await prisma.customerRequirement.findMany({
      where: { organizationId, active: true },
      select: { assetClass: true, transactionType: true, bhk: true, commercialPropertyType: true, maxBudget: true, preferredLocalities: true },
    });

    const buckets = new Map<string, Bucket>();
    for (const req of requirements) {
      let localities: string[];
      try {
        const parsed = JSON.parse(req.preferredLocalities || "[]");
        localities = Array.isArray(parsed) && parsed.length > 0 ? parsed : ["Any"];
      } catch {
        localities = ["Any"];
      }
      const band = budgetBand(req.maxBudget);
      for (const locality of localities) {
        const key = [locality, req.assetClass, req.transactionType, req.assetClass === "COMMERCIAL" ? req.commercialPropertyType : req.bhk, band].join("|");
        const existing = buckets.get(key);
        if (existing) existing.demand += 1;
        else
          buckets.set(key, {
            locality,
            bhk: req.assetClass === "COMMERCIAL" ? null : req.bhk,
            assetClass: req.assetClass,
            transactionType: req.transactionType,
            commercialSubtype: req.assetClass === "COMMERCIAL" ? req.commercialPropertyType : null,
            budgetBand: band,
            demand: 1,
          });
      }
    }

    const rows = await Promise.all(
      Array.from(buckets.values()).map(async (bucket) => {
        const available = await prisma.property.count({
          where: {
            organizationId,
            status: "AVAILABLE",
            assetClass: bucket.assetClass,
            listingType: bucket.transactionType,
            ...(bucket.locality !== "Any" ? { area: { contains: bucket.locality } } : {}),
            ...(bucket.assetClass === "RESIDENTIAL" && bucket.bhk != null ? { bhk: bucket.bhk } : {}),
            ...(bucket.assetClass === "COMMERCIAL" && bucket.commercialSubtype ? { propertyType: bucket.commercialSubtype } : {}),
          },
        });
        return { ...bucket, available };
      })
    );

    rows.sort((a, b) => b.demand - a.demand);
    return NextResponse.json({ rows });
  } catch (err) {
    return handleApiError(err);
  }
}
