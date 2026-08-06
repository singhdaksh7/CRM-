import type { Lead, Notification, NotificationType, Property, User } from "@prisma/client";
import { prisma } from "../prisma";
import { Rng } from "./rng";
import { DEMO_ORGANIZATION_ID } from "./constants";

export const NOTIFICATION_COUNT = 40;

/**
 * The task's 6 requested notification categories, mapped onto the real
 * NotificationType enum. "Visit Today" and "Property Unavailable" have no
 * 1:1 enum value - VISIT_SCHEDULED and PROPERTY_UNAVAILABLE_AFTER_SHARE are
 * the closest existing types (see Known Limitations); the other four map
 * exactly.
 */
interface CategoryPlan {
  label: string;
  type: NotificationType;
  weight: number;
}
const CATEGORIES: CategoryPlan[] = [
  { label: "Hot Lead", type: "HOT_LEAD_NO_FOLLOWUP", weight: 7 },
  { label: "Visit Today", type: "VISIT_SCHEDULED", weight: 7 },
  { label: "Payment Pending", type: "PAYMENT_PENDING", weight: 6 },
  { label: "Catalogue Opened", type: "CATALOGUE_VIEWED", weight: 7 },
  { label: "Property Unavailable", type: "PROPERTY_UNAVAILABLE_AFTER_SHARE", weight: 6 },
  { label: "Follow-up Due", type: "FOLLOW_UP_DUE", weight: 7 },
];

function expandByWeight(count: number): CategoryPlan[] {
  const totalWeight = CATEGORIES.reduce((s, c) => s + c.weight, 0);
  const out: CategoryPlan[] = [];
  for (const c of CATEGORIES) {
    const n = Math.round((c.weight / totalWeight) * count);
    for (let i = 0; i < n; i++) out.push(c);
  }
  while (out.length < count) out.push(CATEGORIES[out.length % CATEGORIES.length]);
  return out.slice(0, count);
}

function messageFor(label: string, lead: Lead, property: Property): string {
  switch (label) {
    case "Hot Lead": return `${lead.clientName} is a hot lead with no follow-up scheduled.`;
    case "Visit Today": return `Visit with ${lead.clientName} is scheduled for today.`;
    case "Payment Pending": return `A payment linked to ${lead.clientName}'s deal is pending.`;
    case "Catalogue Opened": return `${lead.clientName} opened a shared catalogue.`;
    case "Property Unavailable": return `${property.propertyCode} became unavailable after being shared with ${lead.clientName}.`;
    case "Follow-up Due": return `A follow-up for ${lead.clientName} is due.`;
    default: return `${label} - ${lead.clientName}.`;
  }
}

/** Realistic notification history across the 6 requested categories, distributed roughly evenly across `count` rows. */
export async function createDemoNotificationHistory(
  rng: Rng,
  employees: User[],
  leads: Lead[],
  properties: Property[],
  count: number = NOTIFICATION_COUNT
): Promise<Notification[]> {
  const plan = rng.shuffle(expandByWeight(count));
  const out: Notification[] = [];

  for (let i = 0; i < plan.length; i++) {
    const category = plan[i];
    const lead = leads[i % leads.length];
    const property = properties[i % properties.length];
    const user = rng.pick(employees);

    out.push(
      await prisma.notification.create({
        data: {
          organizationId: DEMO_ORGANIZATION_ID,
          userId: user.id,
          type: category.type,
          title: category.label,
          message: messageFor(category.label, lead, property),
          leadId: lead.id,
          propertyId: category.label === "Property Unavailable" ? property.id : null,
          isRead: rng.bool(0.4),
          readAt: rng.bool(0.4) ? rng.pastDate(0, 3) : null,
          createdAt: rng.pastDate(0, 10),
        },
      })
    );
  }

  return out;
}
