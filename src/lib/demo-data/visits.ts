import type { Lead, Property, User, Visit } from "@prisma/client";
import { prisma } from "../prisma";
import { Rng } from "./rng";
import { demoId, DEMO_ORGANIZATION_ID } from "./constants";

export const VISIT_COUNT = 15;
const VISIT_OUTCOMES: NonNullable<Visit["outcome"]>[] = ["HIGHLY_INTERESTED", "INTERESTED", "NEEDS_TIME", "NOT_INTERESTED", "WANTS_ANOTHER_PROPERTY", "READY_FOR_NEGOTIATION"];

/** scheduled / completed / cancelled / rescheduled, per the task spec - all four are real VisitStatus values, no mapping needed this time. */
type Bucket = "SCHEDULED" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";
function bucketPlanFor(count: number): [Bucket, number][] {
  const scheduled = Math.round(count * 0.35);
  const completed = Math.round(count * 0.35);
  const cancelled = Math.round(count * 0.15);
  const rescheduled = Math.max(0, count - scheduled - completed - cancelled);
  return [["SCHEDULED", scheduled], ["COMPLETED", completed], ["CANCELLED", cancelled], ["RESCHEDULED", rescheduled]];
}

function expandBuckets(count: number): Bucket[] {
  const out: Bucket[] = [];
  for (const [bucket, n] of bucketPlanFor(count)) for (let i = 0; i < n; i++) out.push(bucket);
  return out;
}

export async function createDemoVisits(rng: Rng, leads: Lead[], properties: Property[], fieldExecutives: User[], count: number = VISIT_COUNT): Promise<Visit[]> {
  const buckets = rng.shuffle(expandBuckets(count));
  const visits: Visit[] = [];

  for (let i = 1; i <= count; i++) {
    const lead = leads[(i * 5) % leads.length];
    const property = properties[(i * 7) % properties.length];
    const exec = rng.pick(fieldExecutives);
    const bucket = buckets[i - 1];

    let status: Visit["status"];
    let visitDate: Date;
    let outcome: Visit["outcome"] | null = null;
    let clientFeedback: string | null = null;
    let employeeNotes: string | null = null;
    let followUpAction: string | null = null;

    switch (bucket) {
      case "SCHEDULED":
        status = "SCHEDULED";
        visitDate = rng.daysFromNow(rng.int(1, 10));
        break;
      case "COMPLETED":
        status = "COMPLETED";
        visitDate = rng.pastDate(1, 20);
        outcome = rng.pick(VISIT_OUTCOMES);
        clientFeedback = "Client liked the location and layout.";
        employeeNotes = "Discussed pricing, client to confirm in 2 days.";
        followUpAction = "Schedule follow-up call in 2 days";
        break;
      case "CANCELLED":
        status = "CANCELLED";
        visitDate = rng.daysFromNow(rng.int(-5, 5));
        employeeNotes = "Client requested to cancel - rescheduling separately.";
        break;
      case "RESCHEDULED":
        status = "RESCHEDULED";
        visitDate = rng.daysFromNow(rng.int(2, 12));
        employeeNotes = "Original slot didn't work for the client - moved to a new date/time.";
        break;
    }

    visits.push(
      await prisma.visit.create({
        data: {
          id: demoId("visit", i),
          organizationId: DEMO_ORGANIZATION_ID,
          leadId: lead.id,
          propertyId: property.id,
          assignedToId: exec.id,
          visitDate,
          visitTime: `${10 + (i % 8)}:00`,
          meetingLocation: `${property.area} - Property Site`,
          status,
          clientFeedback,
          employeeNotes,
          outcome,
          followUpAction,
        },
      })
    );
  }

  return visits;
}
