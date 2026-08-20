import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";

const NEW_PROPERTY_WINDOW_DAYS = 7;

// GET /api/customers/stats - org-scoped Demand Pool dashboard counters.
// Readable by every role (same view rule as GET /api/customers).
export async function GET() {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user);
    const newPropertyCutoff = new Date(Date.now() - NEW_PROPERTY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [
      totalCustomers,
      activeRequirements,
      residentialDemand,
      commercialDemand,
      rentDemand,
      saleDemand,
      neverContacted,
      newPropertiesWithMatches,
      highMatchOpportunities,
    ] = await Promise.all([
      prisma.customerContact.count({ where: { organizationId } }),
      prisma.customerRequirement.count({ where: { organizationId, active: true } }),
      prisma.customerRequirement.count({ where: { organizationId, active: true, assetClass: "RESIDENTIAL" } }),
      prisma.customerRequirement.count({ where: { organizationId, active: true, assetClass: "COMMERCIAL" } }),
      prisma.customerRequirement.count({ where: { organizationId, active: true, transactionType: "RENT" } }),
      prisma.customerRequirement.count({ where: { organizationId, active: true, transactionType: "SALE" } }),
      prisma.customerContact.count({ where: { organizationId, lastContactedAt: null } }),
      prisma.property.count({
        where: { organizationId, createdAt: { gte: newPropertyCutoff }, matchRecommendations: { some: {} } },
      }),
      prisma.propertyRecommendation.count({
        where: { organizationId, tier: { in: ["EXACT", "STRONG"] }, status: { in: ["PENDING", "REVIEWED"] } },
      }),
    ]);

    return NextResponse.json({
      stats: {
        totalCustomers,
        activeRequirements,
        residentialDemand,
        commercialDemand,
        rentDemand,
        saleDemand,
        neverContacted,
        newPropertiesWithMatches,
        highMatchOpportunities,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
