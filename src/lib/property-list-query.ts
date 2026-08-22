import type { Prisma, PropertyStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { getCoverImageUrls } from "./property-images";

/**
 * Operational property listing uses Property.createdAt as the business
 * "listed date". There is no separate listedAt / publishedAt column on
 * Property in this schema (availableFrom is move-in availability, not listing
 * time). Documented so catalogue/visit UIs stay consistent.
 */
export const PROPERTY_LIST_SORT_TIMESTAMP = "createdAt" as const;
export const PROPERTY_LIST_INITIAL_TAKE = 10;

export const PROPERTY_LIST_CARD_SELECT = {
  id: true,
  propertyCode: true,
  title: true,
  area: true,
  city: true,
  listingType: true,
  monthlyRent: true,
  salePrice: true,
  bhk: true,
  bathrooms: true,
  builtUpAreaSqft: true,
  furnishing: true,
  assetClass: true,
  propertyType: true,
  workstations: true,
  cabins: true,
  status: true,
  coverImage: true,
  createdAt: true,
} satisfies Prisma.PropertySelect;

export type PropertyListCard = Prisma.PropertyGetPayload<{ select: typeof PROPERTY_LIST_CARD_SELECT }>;

export interface PropertyListCursor {
  createdAt: string;
  id: string;
}

export function encodePropertyListCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id }), "utf8").toString("base64url");
}

export function decodePropertyListCursor(raw: string | null | undefined): PropertyListCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as PropertyListCursor;
    if (!parsed?.createdAt || !parsed?.id) return null;
    if (Number.isNaN(Date.parse(parsed.createdAt))) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function listAvailablePropertiesPage(params: {
  organizationId: string;
  take?: number;
  cursor?: string | null;
  /**
   * When omitted/undefined, defaults to AVAILABLE-only operational inventory.
   * Pass `null` to list every status (All Status filter).
   */
  status?: PropertyStatus | null;
  q?: string | null;
  listingType?: string | null;
  assetClass?: string | null;
  area?: string | null;
  bhk?: number | null;
  furnishing?: string | null;
}) {
  const take = Math.min(Math.max(params.take ?? PROPERTY_LIST_INITIAL_TAKE, 1), 50);
  const cursor = decodePropertyListCursor(params.cursor);

  const where: Prisma.PropertyWhereInput = {
    organizationId: params.organizationId,
  };
  // `null` means All Status; `undefined` (omitted) means operational AVAILABLE default.
  if (params.status === undefined) where.status = "AVAILABLE";
  else if (params.status !== null) where.status = params.status;

  if (params.q) {
    where.OR = [
      { title: { contains: params.q } },
      { area: { contains: params.q } },
      { address: { contains: params.q } },
      { propertyCode: { contains: params.q } },
    ];
  }
  if (params.listingType) where.listingType = params.listingType as never;
  if (params.assetClass) where.assetClass = params.assetClass as never;
  if (params.area) where.area = params.area;
  if (params.bhk != null) where.bhk = params.bhk;
  if (params.furnishing) where.furnishing = params.furnishing as never;

  if (cursor) {
    where.AND = [
      {
        OR: [
          { createdAt: { lt: new Date(cursor.createdAt) } },
          { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
        ],
      },
    ];
  }

  const rows = await prisma.property.findMany({
    where,
    select: PROPERTY_LIST_CARD_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
  });

  const hasMore = rows.length > take;
  const properties = hasMore ? rows.slice(0, take) : rows;
  const nextCursor = hasMore && properties.length > 0 ? encodePropertyListCursor(properties[properties.length - 1]) : null;

  const coverImageUrls = await getCoverImageUrls(
    properties.map((p) => p.id),
    params.organizationId
  );

  return {
    properties,
    coverImageUrls,
    nextCursor,
    /** Timestamp field used for newest-first ordering / listed date display. */
    listedTimestampField: PROPERTY_LIST_SORT_TIMESTAMP,
  };
}
