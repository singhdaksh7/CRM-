import type { CatalogueShare, Lead, Property, User } from "@prisma/client";
import { prisma } from "../prisma";
import { Rng } from "./rng";
import { demoId, DEMO_ORGANIZATION_ID } from "./constants";

export const CATALOGUE_COUNT = 10;

/** "Create demo catalogues already shared with clients" - every catalogue below represents a real share; the bucket only varies how the client engaged with it afterward. */
type Bucket = "VIEWED_ENGAGED" | "VIEWED_NO_RESPONSE" | "UNOPENED" | "EXPIRED";
function bucketPlanFor(count: number): [Bucket, number][] {
  const viewedEngaged = Math.max(1, Math.round(count * 0.3));
  const viewedNoResponse = Math.max(1, Math.round(count * 0.2)); // includes the deterministic notifyCatalogueNoResponse scenario at index 0 of this bucket
  const unopened = Math.max(1, Math.round(count * 0.3));
  const expired = Math.max(0, count - viewedEngaged - viewedNoResponse - unopened);
  return [["VIEWED_ENGAGED", viewedEngaged], ["VIEWED_NO_RESPONSE", viewedNoResponse], ["UNOPENED", unopened], ["EXPIRED", expired]];
}

function expandBuckets(count: number): Bucket[] {
  const out: Bucket[] = [];
  for (const [bucket, n] of bucketPlanFor(count)) for (let i = 0; i < n; i++) out.push(bucket);
  return out;
}

export interface DemoCatalogueSet {
  all: CatalogueShare[];
  noResponseScenarioId: string;
}

export async function createDemoCatalogues(
  rng: Rng,
  leads: Lead[],
  properties: Property[],
  employees: { admin: User; dataManagers: User[] },
  count: number = CATALOGUE_COUNT
): Promise<DemoCatalogueSet> {
  const buckets = rng.shuffle(expandBuckets(count));
  const creators = [employees.admin, ...employees.dataManagers];
  const all: CatalogueShare[] = [];
  let noResponseScenarioId = "";

  for (let i = 1; i <= count; i++) {
    const lead = leads[(i * 9) % leads.length];
    const shareProperties = rng.pickMany(properties, rng.int(2, 5));
    const creator = rng.pick(creators);
    const bucket = buckets[i - 1];
    const isFirstNoResponse = bucket === "VIEWED_NO_RESPONSE" && !noResponseScenarioId;

    let status: CatalogueShare["status"] = "ACTIVE";
    let viewCount = 0;
    let lastViewedAt: Date | null = null;
    let expiresAt: Date | null = rng.daysFromNow(rng.int(20, 60));

    if (bucket === "VIEWED_ENGAGED" || bucket === "VIEWED_NO_RESPONSE") {
      viewCount = rng.int(1, 5);
      lastViewedAt = isFirstNoResponse ? rng.pastDate(2, 3) : rng.pastDate(0, 5);
    } else if (bucket === "EXPIRED") {
      status = "EXPIRED";
      expiresAt = rng.pastDate(1, 15);
      viewCount = rng.int(0, 3);
      lastViewedAt = viewCount > 0 ? rng.pastDate(15, 30) : null;
    }

    const catalogue = await prisma.catalogueShare.create({
      data: {
        id: demoId("cat", i),
        organizationId: DEMO_ORGANIZATION_ID,
        token: demoId("cat-token", i),
        leadId: lead.id,
        createdByUserId: creator.id,
        title: `Shortlist for ${lead.clientName}`,
        introMessage: `Hi ${lead.clientName}, here are some properties matching your requirement in ${lead.preferredLocation}.`,
        includePrice: true,
        includeAddress: rng.bool(0.4),
        includeBrokerage: rng.bool(0.2),
        status,
        expiresAt,
        viewCount,
        lastViewedAt,
        properties: {
          create: shareProperties.map((p, idx) => ({
            propertyId: p.id,
            sortOrder: idx,
            isTopPick: idx === 0,
            priceVisible: true,
            addedByUserId: creator.id,
          })),
        },
      },
    });
    all.push(catalogue);

    if (viewCount > 0) {
      await prisma.catalogueInteraction.create({
        data: {
          organizationId: DEMO_ORGANIZATION_ID,
          catalogueShareId: catalogue.id,
          type: "VIEWED",
          createdAt: lastViewedAt ?? rng.pastDate(0, 5),
        },
      });
    }
    if (bucket === "VIEWED_ENGAGED") {
      const interestedProperty = rng.pick(shareProperties);
      await prisma.catalogueInteraction.create({
        data: {
          organizationId: DEMO_ORGANIZATION_ID,
          catalogueShareId: catalogue.id,
          propertyId: interestedProperty.id,
          type: rng.pick(["INTERESTED", "VISIT_REQUESTED", "QUESTION_ASKED"] as const),
          message: rng.bool(0.5) ? "Can we schedule a visit this weekend?" : null,
          createdAt: rng.pastDate(0, 4),
        },
      });
    }

    if (isFirstNoResponse) noResponseScenarioId = catalogue.id;
  }

  return { all, noResponseScenarioId };
}
