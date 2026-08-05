import { prisma } from "./prisma";
import { logActivity } from "./activity";
import { createNotification, notifyRoles } from "./notifications";
import type { ActivityType, NotificationType } from "@prisma/client";

export type PropertyChangeType = "UNAVAILABLE" | "PRICE_CHANGED";

// How far back to look before deciding a given catalogue+property change
// already raised an alert - mirrors the idempotency pattern used elsewhere
// (generateDueFollowUpNotifications in notifications.ts, runMatchingForLead
// in lead-matching.ts), just windowed to an hour instead of 10 minutes since
// a property edit is a much rarer/heavier event than a matching re-run.
const IDEMPOTENCY_WINDOW_MS = 60 * 60 * 1000;

const ACTIVITY_TYPE_BY_CHANGE: Record<PropertyChangeType, ActivityType> = {
  UNAVAILABLE: "PROPERTY_UNAVAILABLE_AFTER_SHARE",
  PRICE_CHANGED: "PROPERTY_PRICE_CHANGED_AFTER_SHARE",
};

const NOTIFICATION_TYPE_BY_CHANGE: Record<PropertyChangeType, NotificationType> = {
  UNAVAILABLE: "PROPERTY_UNAVAILABLE_AFTER_SHARE",
  PRICE_CHANGED: "PROPERTY_PRICE_CHANGED_AFTER_SHARE",
};

/**
 * Called after a property update that makes it unavailable (status flips
 * away from AVAILABLE) or changes its price (monthlyRent/salePrice). Finds
 * every ACTIVE catalogue share that already includes this property, and logs
 * an activity + notifies the catalogue's creator (falling back to
 * Admin/Data Manager broadcast if the catalogue has no creator on record) for
 * each affected lead - once per catalogue+property+event within the
 * idempotency window, so re-saving the same property repeatedly doesn't spam.
 */
export async function notifyAffectedCataloguesOfPropertyChange(
  propertyId: string,
  changeType: PropertyChangeType
): Promise<{ notified: number }> {
  const shareProperties = await prisma.catalogueShareProperty.findMany({
    where: { propertyId, catalogueShare: { status: "ACTIVE" } },
    include: { catalogueShare: { include: { lead: true } } },
  });

  if (shareProperties.length === 0) return { notified: 0 };

  const activityType = ACTIVITY_TYPE_BY_CHANGE[changeType];
  const notificationType = NOTIFICATION_TYPE_BY_CHANGE[changeType];
  const since = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS);

  let notified = 0;

  for (const csp of shareProperties) {
    const catalogueShare = csp.catalogueShare;
    const leadId = catalogueShare.leadId;

    const recentActivity = await prisma.activity.findFirst({
      where: {
        leadId,
        type: activityType,
        createdAt: { gte: since },
        metadata: { contains: propertyId },
      },
    });
    if (recentActivity) continue;

    const message =
      changeType === "UNAVAILABLE"
        ? `A property in catalogue "${catalogueShare.title}" is no longer available.`
        : `The price of a property in catalogue "${catalogueShare.title}" has changed.`;

    await logActivity({
      leadId,
      type: activityType,
      description: message,
      metadata: { propertyId, catalogueShareId: catalogueShare.id },
    });

    if (catalogueShare.createdByUserId) {
      await createNotification({
        organizationId: catalogueShare.organizationId,
        userId: catalogueShare.createdByUserId,
        type: notificationType,
        title: changeType === "UNAVAILABLE" ? "Shared property unavailable" : "Shared property price changed",
        message,
        leadId,
        propertyId,
      });
    } else {
      await notifyRoles(["ADMIN", "DATA_MANAGER"], {
        organizationId: catalogueShare.organizationId,
        type: notificationType,
        title: changeType === "UNAVAILABLE" ? "Shared property unavailable" : "Shared property price changed",
        message,
        leadId,
        propertyId,
      });
    }

    notified++;
  }

  return { notified };
}
