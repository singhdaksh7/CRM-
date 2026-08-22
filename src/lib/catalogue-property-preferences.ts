import type { CataloguePropertyPreferenceStatus, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { getCoverImageUrls } from "./property-images";
import { logActivity } from "./activity";

export type PreferenceStatus = CataloguePropertyPreferenceStatus;

const PREFERENCE_PROPERTY_SELECT = {
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

export interface UpsertCataloguePreferenceInput {
  /** Opaque public catalogue share token - never an internal id from the browser. */
  token: string;
  propertyId: string;
  status: Exclude<PreferenceStatus, "UNDECIDED">;
  note?: string | null;
}

/**
 * Public, token-authenticated preference upsert.
 *
 * Security contract:
 * - organizationId / leadId derived only from CatalogueShare resolved by token
 * - property must belong to that catalogue (active membership preferred; removed
 *   rows still accepted so a client can update preference on a previously seen item)
 * - never trusts organizationId from the request body
 * - idempotent on same status; allows LIKED <-> NOT_INTERESTED
 * - does NOT create per-click employee notifications (aggregate summaries instead)
 */
export async function upsertCataloguePropertyPreference(input: UpsertCataloguePreferenceInput) {
  const catalogue = await prisma.catalogueShare.findUnique({
    where: { token: input.token },
    select: {
      id: true,
      organizationId: true,
      leadId: true,
      status: true,
      expiresAt: true,
      title: true,
      lead: { select: { id: true, clientName: true } },
    },
  });
  if (!catalogue) throw new ApiError(404, "Catalogue not found");

  if (catalogue.status === "ACTIVE" && catalogue.expiresAt && catalogue.expiresAt < new Date()) {
    await prisma.catalogueShare.update({ where: { id: catalogue.id }, data: { status: "EXPIRED" } });
    throw new ApiError(400, "This catalogue link is expired and no longer accepts preferences.");
  }
  if (catalogue.status !== "ACTIVE") {
    throw new ApiError(400, `This catalogue link is ${catalogue.status.toLowerCase()} and no longer accepts preferences.`);
  }

  const membership = await prisma.catalogueShareProperty.findUnique({
    where: {
      catalogueShareId_propertyId: { catalogueShareId: catalogue.id, propertyId: input.propertyId },
    },
    select: { id: true, removedAt: true },
  });
  if (!membership) {
    throw new ApiError(400, "That property is not part of this catalogue");
  }

  const property = await prisma.property.findFirst({
    where: { id: input.propertyId, organizationId: catalogue.organizationId },
    select: { id: true, propertyCode: true },
  });
  if (!property) {
    // Cross-org or deleted: treat as not in catalogue rather than leaking existence.
    throw new ApiError(400, "That property is not part of this catalogue");
  }

  const now = new Date();
  const preference = await prisma.cataloguePropertyPreference.upsert({
    where: {
      catalogueShareId_propertyId: { catalogueShareId: catalogue.id, propertyId: input.propertyId },
    },
    create: {
      organizationId: catalogue.organizationId,
      catalogueShareId: catalogue.id,
      propertyId: input.propertyId,
      leadId: catalogue.leadId,
      status: input.status,
      note: input.note ?? null,
      respondedAt: now,
    },
    update: {
      status: input.status,
      note: input.note === undefined ? undefined : input.note,
      respondedAt: now,
    },
  });

  await logActivity({
    leadId: catalogue.leadId,
    type: input.status === "LIKED" ? "PROPERTY_INTERESTED" : "PROPERTY_NOT_INTERESTED",
    description:
      input.status === "LIKED"
        ? `Client liked property ${property.propertyCode} on catalogue "${catalogue.title}".`
        : `Client marked property ${property.propertyCode} as not interested on catalogue "${catalogue.title}".`,
  });

  return preference;
}

export async function getCataloguePreferencesByToken(token: string) {
  const catalogue = await prisma.catalogueShare.findUnique({
    where: { token },
    select: { id: true, organizationId: true, status: true },
  });
  if (!catalogue) throw new ApiError(404, "Catalogue not found");

  const preferences = await prisma.cataloguePropertyPreference.findMany({
    where: { catalogueShareId: catalogue.id, organizationId: catalogue.organizationId },
    select: { propertyId: true, status: true, respondedAt: true, note: true },
  });
  return { catalogueShareId: catalogue.id, preferences };
}

export interface PreferencePropertyCard {
  propertyId: string;
  preference: PreferenceStatus;
  respondedAt: Date | null;
  note: string | null;
  available: boolean;
  catalogueShareId: string;
  catalogueTitle: string;
  property: {
    id: string;
    propertyCode: string;
    title: string;
    area: string;
    city: string;
    listingType: string;
    monthlyRent: number | null;
    salePrice: number | null;
    bhk: number;
    status: string;
    coverImage: string | null;
    thumbnailUrl: string | null;
  };
}

export async function getCataloguePreferenceSummary(catalogueShareId: string, organizationId: string) {
  const catalogue = await prisma.catalogueShare.findFirst({
    where: { id: catalogueShareId, organizationId },
    select: {
      id: true,
      title: true,
      properties: { where: { removedAt: null }, select: { propertyId: true } },
    },
  });
  if (!catalogue) throw new ApiError(404, "Catalogue not found");

  const activePropertyIds = catalogue.properties.map((p) => p.propertyId);
  const preferences = await prisma.cataloguePropertyPreference.findMany({
    where: {
      catalogueShareId,
      organizationId,
      propertyId: { in: activePropertyIds },
      status: { in: ["LIKED", "NOT_INTERESTED"] },
    },
    include: { property: { select: PREFERENCE_PROPERTY_SELECT } },
  });

  const byProperty = new Map(preferences.map((p) => [p.propertyId, p]));
  const liked = preferences.filter((p) => p.status === "LIKED");
  const notInterested = preferences.filter((p) => p.status === "NOT_INTERESTED");
  const noResponseCount = activePropertyIds.filter((id) => !byProperty.has(id)).length;

  const coverUrls = await getCoverImageUrls(
    preferences.map((p) => p.propertyId),
    organizationId
  );

  const toCard = (row: (typeof preferences)[number]): PreferencePropertyCard => ({
    propertyId: row.propertyId,
    preference: row.status,
    respondedAt: row.respondedAt,
    note: row.note,
    available: row.property.status === "AVAILABLE",
    catalogueShareId: catalogue.id,
    catalogueTitle: catalogue.title,
    property: {
      ...row.property,
      thumbnailUrl: coverUrls[row.propertyId] ?? row.property.coverImage,
    },
  });

  return {
    catalogueShareId: catalogue.id,
    title: catalogue.title,
    totalProperties: activePropertyIds.length,
    likedCount: liked.length,
    notInterestedCount: notInterested.length,
    noResponseCount,
    liked: liked.map(toCard),
    notInterested: notInterested.map(toCard),
  };
}

export async function getLeadPropertyPreferences(leadId: string, organizationId: string) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId }, select: { id: true } });
  if (!lead) throw new ApiError(404, "Lead not found");

  const preferences = await prisma.cataloguePropertyPreference.findMany({
    where: {
      leadId,
      organizationId,
      status: { in: ["LIKED", "NOT_INTERESTED"] },
    },
    include: {
      property: { select: PREFERENCE_PROPERTY_SELECT },
      catalogueShare: { select: { id: true, title: true, token: true } },
    },
    orderBy: { respondedAt: "desc" },
  });

  const coverUrls = await getCoverImageUrls(
    preferences.map((p) => p.propertyId),
    organizationId
  );

  const liked = preferences.filter((p) => p.status === "LIKED");
  const notInterested = preferences.filter((p) => p.status === "NOT_INTERESTED");

  const toCard = (row: (typeof preferences)[number]): PreferencePropertyCard => ({
    propertyId: row.propertyId,
    preference: row.status,
    respondedAt: row.respondedAt,
    note: row.note,
    available: row.property.status === "AVAILABLE",
    catalogueShareId: row.catalogueShare.id,
    catalogueTitle: row.catalogueShare.title,
    property: {
      ...row.property,
      thumbnailUrl: coverUrls[row.propertyId] ?? row.property.coverImage,
    },
  });

  return {
    leadId,
    likedCount: liked.length,
    notInterestedCount: notInterested.length,
    liked: liked.map(toCard),
    notInterested: notInterested.map(toCard),
  };
}
