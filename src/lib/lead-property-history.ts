import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { getCoverImageUrls } from "./property-images";
import { getLeadPropertyPreferences } from "./catalogue-property-preferences";

/**
 * Bounded read paths for future Lead/FE UI:
 * catalogues sent, liked properties, previous visits, properties shown previously.
 * Does not rebuild employee-facing pages.
 */
export async function getLeadPropertyHistory(leadId: string, organizationId: string) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId }, select: { id: true } });
  if (!lead) throw new ApiError(404, "Lead not found");

  const [catalogues, preferences, visits, sharedLogs] = await Promise.all([
    prisma.catalogueShare.findMany({
      where: { leadId, organizationId },
      select: {
        id: true,
        title: true,
        token: true,
        status: true,
        version: true,
        createdAt: true,
        viewCount: true,
        lastViewedAt: true,
        _count: { select: { properties: { where: { removedAt: null } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    getLeadPropertyPreferences(leadId, organizationId),
    prisma.visit.findMany({
      where: { leadId, organizationId },
      select: {
        id: true,
        visitDate: true,
        visitTime: true,
        status: true,
        outcome: true,
        catalogueShareId: true,
        property: { select: { id: true, title: true, area: true, status: true, coverImage: true } },
        properties: {
          select: {
            propertyId: true,
            status: true,
            property: { select: { id: true, title: true, area: true, status: true, coverImage: true } },
          },
          orderBy: { sequence: "asc" },
          take: 20,
        },
      },
      orderBy: { visitDate: "desc" },
      take: 25,
    }),
    prisma.sharedPropertyLog.findMany({
      where: { leadId, organizationId },
      select: { id: true, propertyId: true, propertyIds: true, createdAt: true, message: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  const shownPropertyIds = new Set<string>();
  for (const cat of await prisma.catalogueShareProperty.findMany({
    where: { catalogueShare: { leadId, organizationId }, removedAt: null },
    select: { propertyId: true },
    take: 200,
  })) {
    shownPropertyIds.add(cat.propertyId);
  }
  for (const visit of visits) {
    for (const vp of visit.properties) shownPropertyIds.add(vp.propertyId);
    if (visit.property?.id) shownPropertyIds.add(visit.property.id);
  }

  const shownProperties = await prisma.property.findMany({
    where: { id: { in: [...shownPropertyIds] }, organizationId },
    select: {
      id: true,
      title: true,
      area: true,
      status: true,
      coverImage: true,
      listingType: true,
      monthlyRent: true,
      salePrice: true,
      bhk: true,
    },
    take: 100,
  });
  const coverUrls = await getCoverImageUrls(
    shownProperties.map((p) => p.id),
    organizationId
  );

  return {
    leadId,
    cataloguesSent: catalogues.map((c) => ({
      id: c.id,
      title: c.title,
      token: c.token,
      status: c.status,
      version: c.version,
      propertyCount: c._count.properties,
      createdAt: c.createdAt,
      viewCount: c.viewCount,
      lastViewedAt: c.lastViewedAt,
    })),
    likedProperties: preferences.liked,
    notInterestedProperties: preferences.notInterested,
    previousVisits: visits,
    propertiesShownPreviously: shownProperties.map((p) => ({
      ...p,
      thumbnailUrl: coverUrls[p.id] ?? p.coverImage,
    })),
    sharedPropertyLogs: sharedLogs,
  };
}
