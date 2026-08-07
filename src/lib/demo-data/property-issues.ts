import type { Property, User, PropertyAvailabilityReport, PropertyReport } from "@prisma/client";
import { prisma } from "../prisma";
import { Rng } from "./rng";
import { demoId, DEMO_ORGANIZATION_ID } from "./constants";
import { appendPropertyTimelineEvent } from "../property-timeline";
import { ensureDemoAvailabilityReportAsset } from "./assets";

/**
 * Deterministic 1-based property indices for the Property Issues Queue /
 * Inventory Freshness demo scenarios (Objectives 7, 10, 13, Change 15).
 * Deliberately chosen to avoid the property indices visits.ts (i*7 % 50)
 * and properties.ts's own noPhotos/wellPhotographed/staleInactive/noOwner
 * scenario slots already use - a demo visit's Visit.createdAt defaults to
 * "now" at insert time, which would otherwise leak into
 * computeInventoryFreshness's lastVisitAt signal and silently overwrite the
 * intentionally-aged lastVerifiedAt/updatedAt values set below.
 */
export const PROPERTY_ISSUE_SCENARIO_INDEX = {
  pendingAvailability: 2,
  approvedAvailability: 4,
  pendingReport: 9,
  resolvedReport: 11,
  freshnessFresh: 16,
  freshnessVerified: 18,
  freshnessNeedsVerification: 23,
  freshnessStale: 25,
} as const;

export interface DemoPropertyIssueSet {
  availabilityReports: PropertyAvailabilityReport[];
  propertyReports: PropertyReport[];
  pendingAvailabilityScenarioId: string;
  approvedAvailabilityScenarioId: string;
  pendingReportScenarioId: string;
  resolvedReportScenarioId: string;
  freshnessScenarioPropertyIds: { fresh: string; verified: string; needsVerification: string; stale: string };
}

/**
 * Creates one PENDING and one APPROVED PropertyAvailabilityReport (each with
 * its required evidence photo, matching the real route's enforced
 * invariant), one PENDING and one RESOLVED PropertyReport, and ages
 * lastVerifiedAt/updatedAt on 4 more properties so all four Inventory
 * Freshness bands (FRESH/VERIFIED/NEEDS_VERIFICATION/STALE) have at least
 * one real example. Mirrors the real approve-review route's side effects
 * (pendingVerification clear, status change, timeline event) rather than
 * just inserting rows, so the Property Timeline/Health pages have
 * consistent demo data to show.
 */
export async function createDemoPropertyIssues(rng: Rng, properties: Property[], fieldExecutives: User[], admin: User): Promise<DemoPropertyIssueSet> {
  const byIndex = (i: number) => properties[i - 1];
  const assetUrl = ensureDemoAvailabilityReportAsset();
  const availabilityReports: PropertyAvailabilityReport[] = [];
  const propertyReports: PropertyReport[] = [];

  async function createEvidencePhoto(propertyId: string, uploadedById: string) {
    return prisma.propertyImage.create({
      data: {
        organizationId: DEMO_ORGANIZATION_ID,
        propertyId,
        purpose: "AVAILABILITY_REPORT",
        storageProvider: "DEMO",
        storageKey: assetUrl,
        mimeType: "image/svg+xml",
        sizeBytes: 2048,
        uploadedById,
      },
    });
  }

  // --- Scenario 1: PENDING availability verification ---
  const pendingProp = byIndex(PROPERTY_ISSUE_SCENARIO_INDEX.pendingAvailability);
  const pendingReporter = fieldExecutives[0 % fieldExecutives.length];
  const pendingPhoto = await createEvidencePhoto(pendingProp.id, pendingReporter.id);
  const pendingNote = "Called owner twice, no response. Neighbor said the family may have moved out.";
  const pendingReport = await prisma.propertyAvailabilityReport.create({
    data: {
      id: demoId("avail-report", 1),
      organizationId: DEMO_ORGANIZATION_ID,
      propertyId: pendingProp.id,
      reportedById: pendingReporter.id,
      reason: "OWNER_UNREACHABLE",
      note: pendingNote,
      photoId: pendingPhoto.id,
      status: "PENDING",
      createdAt: rng.pastDate(1, 5),
    },
  });
  availabilityReports.push(pendingReport);
  await prisma.property.update({ where: { id: pendingProp.id }, data: { pendingVerification: true } });
  await appendPropertyTimelineEvent({
    organizationId: DEMO_ORGANIZATION_ID,
    propertyId: pendingProp.id,
    eventType: "MARKED_UNAVAILABLE",
    toValue: "PENDING_VERIFICATION",
    note: pendingNote,
    actorId: pendingReporter.id,
  });

  // --- Scenario 2: APPROVED (resolved) availability report - already rented, confirmed and closed out ---
  const approvedProp = byIndex(PROPERTY_ISSUE_SCENARIO_INDEX.approvedAvailability);
  const approvedReporter = fieldExecutives[1 % fieldExecutives.length];
  const approvedPhoto = await createEvidencePhoto(approvedProp.id, approvedReporter.id);
  const approvedNote = "Tenant already moved in, lock changed by owner.";
  const approvedReviewNote = "Confirmed with owner over call - marking as rented.";
  const approvedReport = await prisma.propertyAvailabilityReport.create({
    data: {
      id: demoId("avail-report", 2),
      organizationId: DEMO_ORGANIZATION_ID,
      propertyId: approvedProp.id,
      reportedById: approvedReporter.id,
      reason: "ALREADY_RENTED",
      note: approvedNote,
      photoId: approvedPhoto.id,
      status: "APPROVED",
      reviewedById: admin.id,
      reviewedAt: rng.pastDate(3, 6),
      reviewNote: approvedReviewNote,
      createdAt: rng.pastDate(8, 12),
    },
  });
  availabilityReports.push(approvedReport);
  await prisma.property.update({ where: { id: approvedProp.id }, data: { pendingVerification: false, status: "RENTED" } });
  await appendPropertyTimelineEvent({
    organizationId: DEMO_ORGANIZATION_ID,
    propertyId: approvedProp.id,
    eventType: "MARKED_UNAVAILABLE",
    toValue: "PENDING_VERIFICATION",
    note: approvedNote,
    actorId: approvedReporter.id,
  });
  await appendPropertyTimelineEvent({
    organizationId: DEMO_ORGANIZATION_ID,
    propertyId: approvedProp.id,
    eventType: "VERIFICATION_APPROVED",
    toValue: "RENTED",
    note: approvedReviewNote,
    actorId: admin.id,
  });

  // --- Scenario 3: PENDING general property report (data-quality flag, not an availability claim) ---
  const pendingReportProp = byIndex(PROPERTY_ISSUE_SCENARIO_INDEX.pendingReport);
  const pendingReportReporter = fieldExecutives[2 % fieldExecutives.length];
  const propReport1 = await prisma.propertyReport.create({
    data: {
      id: demoId("prop-report", 1),
      organizationId: DEMO_ORGANIZATION_ID,
      propertyId: pendingReportProp.id,
      reportedById: pendingReportReporter.id,
      type: "WRONG_RENT",
      note: "Listed rent is 15k but owner is now asking 18k.",
      status: "PENDING",
      createdAt: rng.pastDate(1, 4),
    },
  });
  propertyReports.push(propReport1);

  // --- Scenario 4: RESOLVED general property report ---
  const resolvedReportProp = byIndex(PROPERTY_ISSUE_SCENARIO_INDEX.resolvedReport);
  const resolvedReportReporter = fieldExecutives[3 % fieldExecutives.length];
  const propReport2 = await prisma.propertyReport.create({
    data: {
      id: demoId("prop-report", 2),
      organizationId: DEMO_ORGANIZATION_ID,
      propertyId: resolvedReportProp.id,
      reportedById: resolvedReportReporter.id,
      type: "NEEDS_NEW_PHOTOS",
      note: "Photos are 2 years old, interior has changed.",
      status: "RESOLVED",
      resolvedById: admin.id,
      resolvedAt: rng.pastDate(2, 5),
      resolutionNote: "New photos uploaded by data manager.",
      createdAt: rng.pastDate(10, 15),
    },
  });
  propertyReports.push(propReport2);

  // --- Inventory Freshness bands - ages lastVerifiedAt/updatedAt on 4 more
  // properties so all four bands (FRESH/VERIFIED/NEEDS_VERIFICATION/STALE)
  // have a real example. updatedAt must be explicitly overridden for the
  // two older bands too, since computeInventoryFreshness's signal is
  // max(lastVerifiedAt, lastVisitAt, updatedAt) - otherwise the property's
  // original (recent) updatedAt from properties.ts would win and mask the
  // intended older band. ---
  const freshProp = byIndex(PROPERTY_ISSUE_SCENARIO_INDEX.freshnessFresh);
  await prisma.property.update({ where: { id: freshProp.id }, data: { lastVerifiedAt: rng.pastDate(0, 2), lastVerifiedById: admin.id } });

  const verifiedProp = byIndex(PROPERTY_ISSUE_SCENARIO_INDEX.freshnessVerified);
  await prisma.property.update({ where: { id: verifiedProp.id }, data: { lastVerifiedAt: rng.pastDate(15, 20), lastVerifiedById: admin.id } });

  const needsVerificationProp = byIndex(PROPERTY_ISSUE_SCENARIO_INDEX.freshnessNeedsVerification);
  const needsVerificationAt = rng.pastDate(45, 50);
  await prisma.property.update({
    where: { id: needsVerificationProp.id },
    data: { lastVerifiedAt: needsVerificationAt, lastVerifiedById: admin.id, updatedAt: needsVerificationAt },
  });

  const staleProp = byIndex(PROPERTY_ISSUE_SCENARIO_INDEX.freshnessStale);
  const staleAt = rng.pastDate(90, 100);
  await prisma.property.update({ where: { id: staleProp.id }, data: { lastVerifiedAt: staleAt, updatedAt: staleAt } });

  return {
    availabilityReports,
    propertyReports,
    pendingAvailabilityScenarioId: pendingReport.id,
    approvedAvailabilityScenarioId: approvedReport.id,
    pendingReportScenarioId: propReport1.id,
    resolvedReportScenarioId: propReport2.id,
    freshnessScenarioPropertyIds: { fresh: freshProp.id, verified: verifiedProp.id, needsVerification: needsVerificationProp.id, stale: staleProp.id },
  };
}
