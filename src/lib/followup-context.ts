import type { Activity, ActivityType } from "@prisma/client";

export type FollowUpContextActivity = Pick<Activity, "type" | "description" | "metadata" | "createdAt">;

export type PreviousCustomerContext = {
  response: string;
  note: string | null;
} | null;

type InteractionMetadata = { interactionType?: string; outcome?: string | null; notes?: string | null };

const DIRECT_INTERACTION_TYPES: ActivityType[] = ["PHONE_CALL_MADE", "CLIENT_REPLY_RECEIVED"];

function parseInteractionMetadata(metadata: string | null): InteractionMetadata | null {
  if (!metadata) return null;
  try {
    const parsed: unknown = JSON.parse(metadata);
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as InteractionMetadata;
    return typeof value.interactionType === "string" || typeof value.outcome === "string" || typeof value.notes === "string" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Selects conversation context only. Generic system/status/note events are
 * deliberately excluded; NOTE_ADDED qualifies solely when it came from the
 * structured interaction composer and carries its interaction metadata.
 */
export function previousCustomerContext(activities: FollowUpContextActivity[]): PreviousCustomerContext {
  for (const activity of activities) {
    const metadata = parseInteractionMetadata(activity.metadata);
    if (!DIRECT_INTERACTION_TYPES.includes(activity.type) && !metadata?.interactionType) continue;

    return {
      response: metadata?.outcome?.trim() || (activity.type === "CLIENT_REPLY_RECEIVED" ? "Customer reply" : "Customer interaction"),
      note: metadata?.notes?.trim() || (metadata ? null : activity.description),
    };
  }
  return null;
}
