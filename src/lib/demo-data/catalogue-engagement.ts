import type { CatalogueShare, User } from "@prisma/client";
import { prisma } from "../prisma";
import { Rng } from "./rng";
import { DEMO_ORGANIZATION_ID } from "./constants";

const EXECUTIVE_STATUSES = ["SHOWN", "CUSTOMER_LIKED", "SHORTLISTED", "REJECTED"] as const;

export interface DemoCatalogueEngagementSet {
  versionedCatalogueId: string;
  versionEventCount: number;
}

/**
 * Phase 4 - per-property executive engagement checklist (Objective 9,
 * Change 6) and catalogue versioning (Change 10). Runs after
 * createDemoCatalogues() since it needs the real CatalogueShareProperty rows
 * that call created - createDemoCatalogues() doesn't return them, queried
 * back here instead of threading a second return shape through its callers.
 */
export async function createDemoCatalogueEngagement(rng: Rng, catalogues: CatalogueShare[], actor: User): Promise<DemoCatalogueEngagementSet> {
  // --- Executive checklist: give a mix of catalogue properties a non-PENDING status, leaving some untouched for realism ---
  for (const catalogue of catalogues) {
    const shareProperties = await prisma.catalogueShareProperty.findMany({
      where: { catalogueShareId: catalogue.id },
      orderBy: { sortOrder: "asc" },
    });
    for (let idx = 0; idx < shareProperties.length; idx++) {
      if (!rng.bool(0.6)) continue;
      const status = EXECUTIVE_STATUSES[idx % EXECUTIVE_STATUSES.length];
      await prisma.catalogueShareProperty.update({
        where: { id: shareProperties[idx].id },
        data: {
          executiveStatus: status,
          executiveStatusUpdatedAt: rng.pastDate(0, 5),
          executiveStatusUpdatedById: actor.id,
          executiveStatusNote:
            status === "CUSTOMER_LIKED" ? "Client liked the layout and light." : status === "REJECTED" ? "Not a fit - budget too high." : null,
        },
      });
    }
  }

  // --- Versioning: catalogues[0] always has 2-5 properties (see createDemoCatalogues), so it always
  // has room to soft-remove at least one while leaving at least one active - "the client should always
  // land on the latest version via the same stable link" (Change 10). ---
  const versionedCatalogue = catalogues[0];
  const shareProperties = await prisma.catalogueShareProperty.findMany({
    where: { catalogueShareId: versionedCatalogue.id, removedAt: null },
    orderBy: { sortOrder: "asc" },
  });
  const toRemove = shareProperties.slice(0, Math.min(2, Math.max(1, shareProperties.length - 1)));

  let version = versionedCatalogue.version;
  let versionEventCount = 0;
  for (const sp of toRemove) {
    const reason = versionEventCount === 0 ? "Owner took the property off the market." : "Property was already rented through another channel.";
    version += 1;
    await prisma.catalogueShareProperty.update({ where: { id: sp.id }, data: { removedAt: rng.pastDate(1, 4), removedReason: reason } });
    await prisma.catalogueShare.update({ where: { id: versionedCatalogue.id }, data: { version } });
    await prisma.catalogueVersionEvent.create({
      data: {
        organizationId: DEMO_ORGANIZATION_ID,
        catalogueShareId: versionedCatalogue.id,
        version,
        changeType: "PROPERTY_REMOVED",
        propertyId: sp.propertyId,
        reason,
        actorId: actor.id,
      },
    });
    versionEventCount += 1;
  }

  return { versionedCatalogueId: versionedCatalogue.id, versionEventCount };
}
