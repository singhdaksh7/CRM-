import { prisma } from "./prisma";
import { DEFAULT_ORGANIZATION_ID } from "./organization";
import type { Notification, NotificationType, Role } from "@prisma/client";

interface CreateNotificationParams {
  organizationId?: string;
  userId?: string | null;
  role?: Role | null;
  type: NotificationType;
  title: string;
  message: string;
  leadId?: string | null;
  visitId?: string | null;
  propertyId?: string | null;
  followUpId?: string | null;
}

/** Creates a notification targeted either at one user, or broadcast to every user with a given role. */
export async function createNotification(params: CreateNotificationParams): Promise<Notification> {
  return prisma.notification.create({
    data: {
      organizationId: params.organizationId ?? DEFAULT_ORGANIZATION_ID,
      userId: params.userId ?? null,
      role: params.role ?? null,
      type: params.type,
      title: params.title,
      message: params.message,
      leadId: params.leadId ?? null,
      visitId: params.visitId ?? null,
      propertyId: params.propertyId ?? null,
      followUpId: params.followUpId ?? null,
    },
  });
}

/** Broadcasts to every active user of a role (e.g. notify all Admins + Data Managers of a new lead). */
export async function notifyRoles(
  roles: Role[],
  data: Omit<CreateNotificationParams, "userId" | "role">
) {
  await Promise.all(roles.map((role) => createNotification({ ...data, role })));
}

/** Notifications visible to a user: addressed to them directly, or broadcast to their role. */
export function notificationVisibilityWhere(userId: string, role: Role) {
  return {
    OR: [{ userId }, { userId: null, role }],
  };
}

export async function getUnreadCount(userId: string, role: Role): Promise<number> {
  return prisma.notification.count({
    where: { ...notificationVisibilityWhere(userId, role), isRead: false },
  });
}

/**
 * Application-level "cron" for due/overdue follow-up notifications.
 *
 * There is no background worker in this MVP, so this sweep runs lazily -
 * called from the (app) layout on every authenticated page load. It is
 * idempotent: a notification is only created once per follow-up per type
 * (checked via the followUpId foreign key), so re-running it on every
 * request never duplicates alerts. A real cron worker can call this same
 * function on a schedule with no other changes required.
 */
export async function generateDueFollowUpNotifications(organizationId = DEFAULT_ORGANIZATION_ID) {
  const now = new Date();

  const dueFollowUps = await prisma.followUp.findMany({
    where: {
      organizationId,
      status: { in: ["PENDING", "OVERDUE"] },
      dueDate: { lte: now },
      leadId: { not: null },
    },
    include: { lead: true, owner: true },
  });

  for (const followUp of dueFollowUps) {
    if (!followUp.lead) continue;
    const isOverdue = followUp.status === "OVERDUE" || followUp.dueDate < startOfToday(now);
    const type: NotificationType = isOverdue ? "FOLLOW_UP_OVERDUE" : "FOLLOW_UP_DUE";

    const existing = await prisma.notification.findFirst({ where: { followUpId: followUp.id, type } });
    if (existing) continue;

    await createNotification({
      organizationId,
      userId: followUp.ownerId,
      role: followUp.ownerId ? undefined : "DATA_MANAGER",
      type,
      title: isOverdue ? "Follow-up overdue" : "Follow-up due today",
      message: `${followUp.type.replace(/_/g, " ")} follow-up for ${followUp.lead.clientName} is ${isOverdue ? "overdue" : "due today"}.`,
      leadId: followUp.leadId,
      followUpId: followUp.id,
    });

    // Keep the FollowUp row's own status in sync so /follow-ups buckets and
    // the notification agree with each other.
    if (isOverdue && followUp.status !== "OVERDUE") {
      await prisma.followUp.update({ where: { id: followUp.id }, data: { status: "OVERDUE" } });
    }
  }
}

function startOfToday(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}
