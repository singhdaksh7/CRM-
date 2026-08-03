import { prisma } from "./prisma";
import { haversineDistanceMeters, type Coordinates } from "./geo";
import type { ListingType, PropertyStatus } from "@prisma/client";

export const ALLOWED_RADIUS_METERS = [1000, 3000, 5000, 10000] as const;
export type AllowedRadiusMeters = (typeof ALLOWED_RADIUS_METERS)[number];

export interface NearbyPropertiesParams {
  organizationId: string;
  center: Coordinates;
  radiusMeters: AllowedRadiusMeters;
  listingType?: ListingType;
  status?: PropertyStatus;
  minBudget?: number;
  maxBudget?: number;
  bhk?: number;
  excludePropertyId?: string;
  take?: number;
}

export interface NearbyPropertyResult<T> {
  property: T;
  distanceMeters: number;
}

/** ~1 degree of latitude is ~111km; used only as a cheap bounding-box pre-filter before the precise haversine check, not the actual radius test itself. */
function boundingBoxDegrees(radiusMeters: number) {
  return radiusMeters / 111_000;
}

/**
 * Finds properties within `radiusMeters` of `center`, sorted nearest-first.
 * A bounding-box WHERE clause narrows the candidate set at the database
 * level (never a full table scan for a large inventory), then an exact
 * haversine distance filters/sorts precisely - PostGIS-free, appropriate
 * for this CRM's property-count scale. Properties with no geocoded
 * coordinate are never candidates (there's nothing to measure from).
 */
export async function findNearbyProperties(params: NearbyPropertiesParams): Promise<NearbyPropertyResult<Awaited<ReturnType<typeof prisma.property.findMany>>[number]>[]> {
  const delta = boundingBoxDegrees(params.radiusMeters);

  const where: Record<string, unknown> = {
    organizationId: params.organizationId,
    latitude: { gte: params.center.latitude - delta, lte: params.center.latitude + delta },
    longitude: { gte: params.center.longitude - delta, lte: params.center.longitude + delta },
    status: params.status ?? "AVAILABLE",
  };
  if (params.listingType) where.listingType = params.listingType;
  if (params.bhk) where.bhk = params.bhk;
  if (params.excludePropertyId) where.id = { not: params.excludePropertyId };
  if (params.minBudget !== undefined || params.maxBudget !== undefined) {
    const priceField = params.listingType === "SALE" ? "salePrice" : "monthlyRent";
    const priceFilter: Record<string, number> = {};
    if (params.minBudget !== undefined) priceFilter.gte = params.minBudget;
    if (params.maxBudget !== undefined) priceFilter.lte = params.maxBudget;
    where[priceField] = priceFilter;
  }

  const candidates = await prisma.property.findMany({ where, take: 500 });

  const withDistance = candidates
    .filter((p) => p.latitude !== null && p.longitude !== null)
    .map((p) => ({ property: p, distanceMeters: haversineDistanceMeters(params.center, { latitude: p.latitude!, longitude: p.longitude! }) }))
    .filter((r) => r.distanceMeters <= params.radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  return params.take ? withDistance.slice(0, params.take) : withDistance;
}

export function isAllowedRadius(value: number): value is AllowedRadiusMeters {
  return (ALLOWED_RADIUS_METERS as readonly number[]).includes(value);
}
