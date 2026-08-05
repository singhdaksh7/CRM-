import { daysBetween } from "../rules/rule-engine";
import type { TimelineSummaryLine, TimelineSummaryResult } from "./types";

export interface LeadTimelineSummaryInput {
  createdAt: Date;
  /** Activity.type values - typed as string (not the Prisma enum) so this pure module has no Prisma Client dependency and stays safe to import from client components. */
  activities: { type: string }[];
  hasOverdueFollowUp: boolean;
  hasPendingFollowUp: boolean;
  now?: Date;
}

function countByTypes(activities: { type: string }[], types: string[]): number {
  const set = new Set(types);
  return activities.filter((a) => set.has(a.type)).length;
}

/**
 * Pure, deterministic - no I/O, fully unit-testable. Produces a short list
 * of plain-English sentences summarizing a lead's activity timeline,
 * template-filled from actual counts/dates only - never a claim the data
 * doesn't support.
 */
export function computeLeadTimelineSummary(input: LeadTimelineSummaryInput): TimelineSummaryResult {
  const now = input.now ?? new Date();
  const lines: TimelineSummaryLine[] = [];

  const daysActive = daysBetween(input.createdAt, now);
  lines.push({
    id: "age",
    text: daysActive === 0 ? "Lead was created today." : `Lead has been active for ${daysActive} day${daysActive === 1 ? "" : "s"}.`,
    sourceCount: 0,
  });

  const catalogueSentCount = countByTypes(input.activities, ["CATALOGUE_SENT", "CATALOGUE_CREATED"]);
  const catalogueViewedCount = countByTypes(input.activities, ["CATALOGUE_VIEWED"]);
  if (catalogueSentCount > 0) {
    lines.push({
      id: "catalogue",
      text: catalogueViewedCount > 0 ? "Catalogue shared and opened by the client." : "Catalogue shared, not yet opened by the client.",
      sourceCount: catalogueSentCount + catalogueViewedCount,
    });
  }

  const interestedCount = countByTypes(input.activities, ["PROPERTY_INTERESTED"]);
  if (interestedCount > 0) {
    lines.push({ id: "interest", text: `Client marked interest in ${interestedCount} propert${interestedCount === 1 ? "y" : "ies"}.`, sourceCount: interestedCount });
  }

  const visitsCompleted = countByTypes(input.activities, ["VISIT_COMPLETED"]);
  const visitsScheduled = countByTypes(input.activities, ["VISIT_SCHEDULED"]);
  if (visitsCompleted > 0) {
    lines.push({ id: "visits", text: `Visited ${visitsCompleted} propert${visitsCompleted === 1 ? "y" : "ies"}.`, sourceCount: visitsCompleted });
  } else if (visitsScheduled > 0) {
    lines.push({ id: "visits", text: "A property visit is scheduled.", sourceCount: visitsScheduled });
  }

  const negotiationStarted = countByTypes(input.activities, ["DEAL_CLOSED"]) > 0;
  if (negotiationStarted) {
    lines.push({ id: "deal", text: "Deal closed.", sourceCount: 1 });
  } else if (input.hasOverdueFollowUp) {
    lines.push({ id: "followup", text: "Waiting for follow-up - it is currently overdue.", sourceCount: 0 });
  } else if (input.hasPendingFollowUp) {
    lines.push({ id: "followup", text: "Waiting for the next scheduled follow-up.", sourceCount: 0 });
  } else {
    lines.push({ id: "followup", text: "No follow-up is currently scheduled.", sourceCount: 0 });
  }

  return { lines };
}
