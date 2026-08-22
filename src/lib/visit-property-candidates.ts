import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { getCoverImageUrls } from "./property-images";

const CANDIDATE_PROPERTY_SELECT = {
  id: true,
  propertyCode: true,
  title: true,
  area: true,
  city: true,
  listingType: true,
  monthlyRent: true,
  salePrice: true,
  bhk: true,
  status: true,
  coverImage: true,
} satisfies Prisma.PropertySelect;

export type VisitCandidateSource = "liked" | "shared" | "manual";

export interface VisitPropertyCandidate {
  propertyId: string;
  title: string;
  location: string;
  price: number | null;
  listingType: string;
  bhk: number;
  available: boolean;
  status: string;
  preference: "LIKED" | "NOT_INTERESTED" | "UNDECIDED" | null;
  catalogueShareId: string | null;
  catalogueTitle: string | null;
  thumbnailUrl: string | null;
  source: VisitCandidateSource;
}

/**
 * Reusable backend for Schedule Visit property selection:
 * Liked By Client → Shared With Client → Add Manually (current available).
 *
 * Does not create visits. Unavailable liked/shared properties remain visible
 * with available:false so history is preserved but UI can skip default select.
 */
export async function getVisitPropertyCandidates(leadId: string, organizationId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId },
    select: { id: true },
  });
  if (!lead) throw new ApiError(404, "Lead not found");

  const [likedPrefs, catalogues, availableManual] = await Promise.all([
    prisma.cataloguePropertyPreference.findMany({
      where: { leadId, organizationId, status: "LIKED" },
      include: {
        property: { select: CANDIDATE_PROPERTY_SELECT },
        catalogueShare: { select: { id: true, title: true } },
      },
      orderBy: { respondedAt: "desc" },
    }),
    prisma.catalogueShare.findMany({
      where: { leadId, organizationId },
      select: {
        id: true,
        title: true,
        properties: {
          where: { removedAt: null },
          select: {
            propertyId: true,
            property: { select: CANDIDATE_PROPERTY_SELECT },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.property.findMany({
      where: { organizationId, status: "AVAILABLE" },
      select: CANDIDATE_PROPERTY_SELECT,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const preferenceByProperty = new Map<string, "LIKED" | "NOT_INTERESTED" | "UNDECIDED">();
  const allPrefs = await prisma.cataloguePropertyPreference.findMany({
    where: { leadId, organizationId, status: { in: ["LIKED", "NOT_INTERESTED"] } },
    select: { propertyId: true, status: true, respondedAt: true },
    orderBy: { respondedAt: "desc" },
  });
  for (const pref of allPrefs) {
    if (!preferenceByProperty.has(pref.propertyId)) {
      preferenceByProperty.set(pref.propertyId, pref.status);
    }
  }

  const propertyIds = new Set<string>();
  for (const row of likedPrefs) propertyIds.add(row.propertyId);
  for (const cat of catalogues) {
    for (const p of cat.properties) propertyIds.add(p.propertyId);
  }
  for (const p of availableManual) propertyIds.add(p.id);

  const coverUrls = await getCoverImageUrls([...propertyIds], organizationId);

  const priceOf = (p: { listingType: string; monthlyRent: number | null; salePrice: number | null }) =>
    p.listingType === "RENT" ? p.monthlyRent : p.salePrice;

  const liked: VisitPropertyCandidate[] = [];
  const likedIds = new Set<string>();
  for (const row of likedPrefs) {
    if (likedIds.has(row.propertyId)) continue;
    likedIds.add(row.propertyId);
    liked.push({
      propertyId: row.propertyId,
      title: row.property.title,
      location: `${row.property.area}, ${row.property.city}`,
      price: priceOf(row.property),
      listingType: row.property.listingType,
      bhk: row.property.bhk,
      available: row.property.status === "AVAILABLE",
      status: row.property.status,
      preference: "LIKED",
      catalogueShareId: row.catalogueShare.id,
      catalogueTitle: row.catalogueShare.title,
      thumbnailUrl: coverUrls[row.propertyId] ?? row.property.coverImage,
      source: "liked",
    });
  }

  const shared: VisitPropertyCandidate[] = [];
  const sharedIds = new Set<string>();
  for (const cat of catalogues) {
    for (const row of cat.properties) {
      if (likedIds.has(row.propertyId) || sharedIds.has(row.propertyId)) continue;
      sharedIds.add(row.propertyId);
      shared.push({
        propertyId: row.propertyId,
        title: row.property.title,
        location: `${row.property.area}, ${row.property.city}`,
        price: priceOf(row.property),
        listingType: row.property.listingType,
        bhk: row.property.bhk,
        available: row.property.status === "AVAILABLE",
        status: row.property.status,
        preference: preferenceByProperty.get(row.propertyId) ?? null,
        catalogueShareId: cat.id,
        catalogueTitle: cat.title,
        thumbnailUrl: coverUrls[row.propertyId] ?? row.property.coverImage,
        source: "shared",
      });
    }
  }

  const manual: VisitPropertyCandidate[] = availableManual
    .filter((p) => !likedIds.has(p.id) && !sharedIds.has(p.id))
    .map((p) => ({
      propertyId: p.id,
      title: p.title,
      location: `${p.area}, ${p.city}`,
      price: priceOf(p),
      listingType: p.listingType,
      bhk: p.bhk,
      available: true,
      status: p.status,
      preference: preferenceByProperty.get(p.id) ?? null,
      catalogueShareId: null,
      catalogueTitle: null,
      thumbnailUrl: coverUrls[p.id] ?? p.coverImage,
      source: "manual" as const,
    }));

  return { leadId, liked, shared, manual };
}
