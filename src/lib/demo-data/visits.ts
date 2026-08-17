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
          // Every visit - including these legacy single-property ones - gets
          // a VisitProperty row, so the demo dataset exercises exactly one
          // progress code path, the same as production after the backfill.
          properties: {
            create: [
              {
                organizationId: DEMO_ORGANIZATION_ID,
                propertyId: property.id,
                sequence: 0,
                status: status === "COMPLETED" ? "VISITED" : "PENDING",
                visitedAt: status === "COMPLETED" ? visitDate : null,
                visitedById: status === "COMPLETED" ? exec.id : null,
              },
            ],
          },
        },
      })
    );
  }

  visits.push(...(await createDemoWorkflowVisits(leads, properties, fieldExecutives, count)));

  return visits;
}

/** Number of extra multi-property workflow visits appended by createDemoWorkflowVisits. */
export const WORKFLOW_VISIT_COUNT = 3;

/**
 * Three hand-built visits that exercise the full catalogue -> visit ->
 * field-executive workflow end to end, so a demo database always has
 * something meaningful on every screen the workflow touches:
 *
 *   Visit A - 3 properties, upcoming, nothing visited yet (Admin Upcoming
 *             Visits, executive's Upcoming list, [Start Visit]).
 *   Visit B - 2 properties, in progress: 1 visited with a 4-star reaction,
 *             1 still pending (per-property progress, "1/2 Visited").
 *   Visit C - completed, 3 properties rated 2 / 4 / 5, with the 5-star one
 *             marked as the client's preferred property (reporting,
 *             high-interest list, shortlist).
 *
 * Deterministic: fixed ids, fixed offsets from today, fixed ratings - no rng,
 * so two seeds of the same database produce byte-identical rows.
 */
async function createDemoWorkflowVisits(leads: Lead[], properties: Property[], fieldExecutives: User[], baseCount: number): Promise<Visit[]> {
  if (leads.length === 0 || properties.length < 8 || fieldExecutives.length === 0) return [];

  const exec = fieldExecutives[0];
  const out: Visit[] = [];

  const dayOffset = (days: number) => {
    // Anchored to 11:00 IST on the target day so the visit lands on the
    // intended IST calendar date regardless of the seeding machine's timezone.
    const d = new Date();
    d.setUTCHours(5, 30, 0, 0);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  };

  // --- Visit A: 3 properties, upcoming, untouched -------------------------
  const aIndex = baseCount + 1;
  out.push(
    await prisma.visit.create({
      data: {
        id: demoId("visit", aIndex),
        organizationId: DEMO_ORGANIZATION_ID,
        leadId: leads[0].id,
        propertyId: properties[0].id,
        assignedToId: exec.id,
        createdById: exec.id,
        visitDate: dayOffset(1),
        visitTime: "11:00",
        meetingLocation: `${properties[0].area} - Property Site`,
        status: "SCHEDULED",
        properties: {
          create: [properties[0], properties[1], properties[2]].map((p, index) => ({
            organizationId: DEMO_ORGANIZATION_ID,
            propertyId: p.id,
            sequence: index,
            status: "PENDING" as const,
          })),
        },
      },
    })
  );

  // --- Visit B: 2 properties, one visited (4 stars), one pending ----------
  const bIndex = baseCount + 2;
  const bStart = dayOffset(0);
  out.push(
    await prisma.visit.create({
      data: {
        id: demoId("visit", bIndex),
        organizationId: DEMO_ORGANIZATION_ID,
        leadId: leads[1 % leads.length].id,
        propertyId: properties[3].id,
        assignedToId: exec.id,
        createdById: exec.id,
        visitDate: bStart,
        visitTime: "12:30",
        meetingLocation: `${properties[3].area} - Property Site`,
        status: "IN_PROGRESS",
        startedAt: bStart,
        properties: {
          create: [
            {
              organizationId: DEMO_ORGANIZATION_ID,
              propertyId: properties[3].id,
              sequence: 0,
              status: "VISITED" as const,
              visitedAt: bStart,
              visitedById: exec.id,
              reactionRating: 4,
              reactionNote: "Client liked the layout and the balcony; wants to compare with one more option.",
            },
            { organizationId: DEMO_ORGANIZATION_ID, propertyId: properties[4].id, sequence: 1, status: "PENDING" as const },
          ],
        },
      },
    })
  );

  // --- Visit C: completed, 3 properties rated 2/4/5, preferred marked -----
  const cIndex = baseCount + 3;
  const cDate = dayOffset(-3);
  out.push(
    await prisma.visit.create({
      data: {
        id: demoId("visit", cIndex),
        organizationId: DEMO_ORGANIZATION_ID,
        leadId: leads[2 % leads.length].id,
        propertyId: properties[5].id,
        assignedToId: exec.id,
        createdById: exec.id,
        visitDate: cDate,
        visitTime: "10:00",
        meetingLocation: `${properties[5].area} - Property Site`,
        status: "COMPLETED",
        startedAt: cDate,
        completedAt: cDate,
        overallRating: 4,
        completionSummary: "Client shortlisted the M Block 3BHK. Wants to bring family for a second look this weekend.",
        outcome: "INTERESTED",
        properties: {
          create: [
            {
              organizationId: DEMO_ORGANIZATION_ID,
              propertyId: properties[5].id,
              sequence: 0,
              status: "VISITED" as const,
              visitedAt: cDate,
              visitedById: exec.id,
              reactionRating: 2,
              reactionNote: "Ground floor and no natural light - client was not keen.",
            },
            {
              organizationId: DEMO_ORGANIZATION_ID,
              propertyId: properties[6].id,
              sequence: 1,
              status: "VISITED" as const,
              visitedAt: cDate,
              visitedById: exec.id,
              reactionRating: 4,
              reactionNote: "Good size, slightly over budget.",
            },
            {
              organizationId: DEMO_ORGANIZATION_ID,
              propertyId: properties[7].id,
              sequence: 2,
              status: "VISITED" as const,
              visitedAt: cDate,
              visitedById: exec.id,
              reactionRating: 5,
              reactionNote: "Client's favourite - ready to discuss terms.",
              isPreferred: true,
            },
          ],
        },
      },
    })
  );

  return out;
}
