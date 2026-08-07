import type { Visit, VisitFeedback } from "@prisma/client";
import { prisma } from "../prisma";
import { Rng } from "./rng";
import { DEMO_ORGANIZATION_ID } from "./constants";

const LIKED_POOL = ["Spacious living room", "Good natural light", "Modern kitchen", "Quiet locality", "Close to metro", "Well-maintained building"];
const DISLIKED_POOL = ["Parking is tight", "No lift in the building", "Kitchen needs renovation", "Road-facing and noisy", "Ceiling height felt low"];

export interface DemoVisitFeedbackSet {
  all: VisitFeedback[];
}

/**
 * One feedback record per COMPLETED demo visit - VisitFeedback.visitId is
 * @unique, matching the real upsert route's one-per-visit invariant.
 * Alternates a positive-leaning and a negative-leaning profile so both Lead
 * Health and Property Health's feedback-driven factors have real,
 * meaningfully different examples to react to, instead of every completed
 * visit reading identically.
 */
export async function createDemoVisitFeedback(rng: Rng, visits: Visit[]): Promise<DemoVisitFeedbackSet> {
  const completed = visits.filter((v) => v.status === "COMPLETED" && v.assignedToId);
  const all: VisitFeedback[] = [];

  for (let idx = 0; idx < completed.length; idx++) {
    const visit = completed[idx];
    const isPositive = idx % 2 === 0;

    const data = isPositive
      ? {
          customerLiked: JSON.stringify(rng.pickMany(LIKED_POOL, rng.int(2, 3))),
          customerDisliked: rng.bool(0.3) ? JSON.stringify(rng.pickMany(DISLIKED_POOL, 1)) : null,
          budgetIssue: false,
          areaIssue: false,
          parkingIssue: false,
          familyRejected: false,
          ownerRejected: false,
          willVisitAgain: true,
          negotiationRequired: rng.bool(0.5),
          additionalNotes: "Client responded well, follow-up scheduled to discuss terms.",
        }
      : {
          customerLiked: rng.bool(0.4) ? JSON.stringify(rng.pickMany(LIKED_POOL, 1)) : null,
          customerDisliked: JSON.stringify(rng.pickMany(DISLIKED_POOL, rng.int(1, 2))),
          budgetIssue: rng.bool(0.5),
          areaIssue: rng.bool(0.3),
          parkingIssue: rng.bool(0.3),
          familyRejected: rng.bool(0.4),
          ownerRejected: false,
          willVisitAgain: false,
          negotiationRequired: false,
          additionalNotes: "Client not convinced - unlikely to proceed with this property.",
        };

    all.push(
      await prisma.visitFeedback.create({
        data: {
          organizationId: DEMO_ORGANIZATION_ID,
          visitId: visit.id,
          submittedById: visit.assignedToId as string,
          ...data,
        },
      })
    );
  }

  return { all };
}
