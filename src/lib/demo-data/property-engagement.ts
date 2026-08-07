import type { Property, User, PropertyFavorite, PropertyViewLog } from "@prisma/client";
import { prisma } from "../prisma";
import { Rng } from "./rng";

export interface DemoPropertyEngagementSet {
  favorites: PropertyFavorite[];
  viewLogs: PropertyViewLog[];
}

/**
 * Phase 4 - executive Favorites + Recently Viewed (Change 12). Deterministic:
 * the first 2 field executives each favorite 2 properties, and a handful of
 * view-log rows are seeded (including every favorited property, since a
 * real favorite always implies at least one prior view) so both the
 * Favorites card and the Recently Viewed card have real data on first load.
 */
export async function createDemoPropertyEngagement(rng: Rng, properties: Property[], fieldExecutives: User[]): Promise<DemoPropertyEngagementSet> {
  const executives = fieldExecutives.slice(0, Math.min(2, fieldExecutives.length));
  const favorites: PropertyFavorite[] = [];
  const viewLogs: PropertyViewLog[] = [];

  for (let e = 0; e < executives.length; e++) {
    const exec = executives[e];
    const favoriteProperties = [properties[(e * 6) % properties.length], properties[(e * 6 + 3) % properties.length]];

    for (const property of favoriteProperties) {
      favorites.push(
        await prisma.propertyFavorite.create({ data: { userId: exec.id, propertyId: property.id, createdAt: rng.pastDate(1, 10) } })
      );
      // A favorite always implies at least one earlier view.
      viewLogs.push(
        await prisma.propertyViewLog.create({ data: { userId: exec.id, propertyId: property.id, viewedAt: rng.pastDate(1, 10) } })
      );
    }

    // A couple more recently-viewed-but-not-favorited properties per executive.
    const recentlyViewed = [properties[(e * 6 + 8) % properties.length], properties[(e * 6 + 11) % properties.length]];
    for (const property of recentlyViewed) {
      viewLogs.push(
        await prisma.propertyViewLog.create({ data: { userId: exec.id, propertyId: property.id, viewedAt: rng.pastDate(0, 3) } })
      );
    }
  }

  return { favorites, viewLogs };
}
