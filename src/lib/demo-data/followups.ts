import type { FollowUp, Lead, User } from "@prisma/client";
import { prisma } from "../prisma";
import { Rng } from "./rng";
import { demoId, DEMO_ORGANIZATION_ID } from "./constants";
import { SCENARIO_LEAD_INDEX } from "./leads";

export const FOLLOW_UP_COUNT = 20;
const FOLLOW_UP_TYPES: FollowUp["type"][] = ["PHONE_CALL", "WHATSAPP", "PROPERTY_SHARING", "VISIT_CONFIRMATION", "NEGOTIATION", "DOCUMENTATION", "PAYMENT_REMINDER"];

/** Today / Tomorrow / Overdue / Completed, per the task spec. */
type Bucket = "COMPLETED" | "TODAY" | "TOMORROW" | "OVERDUE";
function bucketPlanFor(count: number): [Bucket, number][] {
  const completed = Math.round(count * 0.3);
  const today = Math.round(count * 0.25);
  const tomorrow = Math.round(count * 0.2);
  const overdue = Math.max(0, count - completed - today - tomorrow);
  return [["COMPLETED", completed], ["TODAY", today], ["TOMORROW", tomorrow], ["OVERDUE", overdue]];
}

function expandBuckets(count: number): Bucket[] {
  const out: Bucket[] = [];
  for (const [bucket, n] of bucketPlanFor(count)) for (let i = 0; i < n; i++) out.push(bucket);
  return out;
}

export async function createDemoFollowUps(
  rng: Rng,
  leads: Lead[],
  employees: { admin: User; dataManagers: User[]; fieldExecutives: User[] },
  count: number = FOLLOW_UP_COUNT
): Promise<FollowUp[]> {
  // notifyHotLeadsNoFollowUp needs at least one HOT lead with zero PENDING/OVERDUE
  // follow-ups ever created - exclude that lead entirely from this generator.
  const excludedLeadId = demoId("lead", SCENARIO_LEAD_INDEX.hotNoFollowUp);
  const eligibleLeads = leads.filter((l) => l.id !== excludedLeadId);
  const buckets = rng.shuffle(expandBuckets(count));
  const allStaff = [employees.admin, ...employees.dataManagers, ...employees.fieldExecutives];

  const followUps: FollowUp[] = [];
  for (let i = 1; i <= count; i++) {
    const lead = eligibleLeads[(i * 3) % eligibleLeads.length];
    const owner = lead.assignedToId ? allStaff.find((u) => u.id === lead.assignedToId) ?? rng.pick(allStaff) : rng.pick(allStaff);
    const bucket = buckets[i - 1];

    let status: FollowUp["status"];
    let dueDate: Date;
    let completedAt: Date | null = null;

    switch (bucket) {
      case "COMPLETED":
        status = "COMPLETED";
        dueDate = rng.pastDate(1, 20);
        completedAt = rng.pastDate(0, 1);
        break;
      case "TODAY":
        status = "PENDING";
        dueDate = rng.daysFromNow(0);
        break;
      case "TOMORROW":
        status = "PENDING";
        dueDate = rng.daysFromNow(1);
        break;
      case "OVERDUE":
        status = "OVERDUE";
        dueDate = rng.pastDate(1, 15);
        break;
    }

    followUps.push(
      await prisma.followUp.create({
        data: {
          id: demoId("fu", i),
          organizationId: DEMO_ORGANIZATION_ID,
          leadId: lead.id,
          ownerId: owner.id,
          type: rng.pick(FOLLOW_UP_TYPES),
          dueDate,
          notes: rng.bool(0.3) ? "Confirm budget flexibility before next call." : null,
          status,
          completedAt,
        },
      })
    );
  }

  return followUps;
}
