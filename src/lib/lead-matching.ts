import { prisma } from "./prisma";
import { logActivity } from "./activity";
import { createNotification, notifyRoles } from "./notifications";
import { matchPropertiesToLead } from "./matching";
import { getSystemConfig } from "./system-config";

// Same idempotency window shape as generateDueFollowUpNotifications in
// notifications.ts: a recent-enough notification of the relevant type(s)
// already exists for this lead, so skip notifying again. This guards against
// duplicate MATCHES_READY/NO_MATCHES_FOUND spam when a requirement edit
// re-triggers matching within a few minutes of the last run - the activity
// timeline still gets a fresh MATCHING_STARTED/MATCHES_FOUND pair either way.
const NOTIFICATION_IDEMPOTENCY_WINDOW_MS = 10 * 60 * 1000;

export interface RunMatchingResult {
  matchCount: number;
}

/**
 * Runs the property-matching engine for a lead and records the outcome:
 * activity timeline entries (always) plus admin/data-manager + assignee
 * notifications (unless a recent one already fired for this lead).
 * Called after lead creation ("created") and after a requirement-field
 * edit ("updated") - see ingestWebhookLead, POST /api/leads, and
 * PATCH /api/leads/[id].
 */
export async function runMatchingForLead(leadId: string, trigger: "created" | "updated"): Promise<RunMatchingResult> {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  const organizationId = lead.organizationId;

  const [config, properties] = await Promise.all([
    getSystemConfig(organizationId),
    prisma.property.findMany({ where: { organizationId, status: "AVAILABLE" } }),
  ]);

  await logActivity({
    leadId,
    type: "MATCHING_STARTED",
    description: trigger === "created" ? "Property matching started after lead creation" : "Property matching re-run after requirement update",
  });

  const matches = matchPropertiesToLead(properties, lead, config.matchingBudgetTolerancePct / 100);
  const matchCount = matches.length;

  await logActivity({
    leadId,
    type: "MATCHES_FOUND",
    description: `${matchCount} matching propert${matchCount === 1 ? "y" : "ies"} found`,
  });

  const since = new Date(Date.now() - NOTIFICATION_IDEMPOTENCY_WINDOW_MS);
  const recentNotification = await prisma.notification.findFirst({
    where: {
      leadId,
      type: { in: ["MATCHES_READY", "NO_MATCHES_FOUND"] },
      createdAt: { gte: since },
    },
  });

  if (recentNotification) {
    return { matchCount };
  }

  if (matchCount === 0) {
    const title = "No matching properties";
    const message = `No matching properties currently found for ${lead.clientName}.`;
    await notifyRoles(["ADMIN", "DATA_MANAGER"], {
      organizationId,
      type: "NO_MATCHES_FOUND",
      title,
      message,
      leadId,
    });
    if (lead.assignedToId) {
      await createNotification({
        organizationId,
        userId: lead.assignedToId,
        type: "NO_MATCHES_FOUND",
        title,
        message,
        leadId,
      });
    }
  } else {
    const title = "Property matches ready";
    const message = `${matchCount} match${matchCount === 1 ? "" : "es"} found for ${lead.clientName}.`;
    await notifyRoles(["ADMIN", "DATA_MANAGER"], {
      organizationId,
      type: "MATCHES_READY",
      title,
      message,
      leadId,
    });
    if (lead.assignedToId) {
      await createNotification({
        organizationId,
        userId: lead.assignedToId,
        type: "MATCHES_READY",
        title,
        message,
        leadId,
      });
    }
  }

  return { matchCount };
}
