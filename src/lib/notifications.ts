import Redis from "ioredis";
import { prisma } from "./prisma";
import { DEFAULT_ORGANIZATION_ID } from "./organization";
import { withTiming } from "./perf";
import { logger } from "./logger";
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
  return withTiming("getUnreadCount", "notifications", () =>
    prisma.notification.count({
      where: { ...notificationVisibilityWhere(userId, role), isRead: false },
    })
  );
}

/**
 * Due/overdue follow-up notification sweep. Previously invoked lazily on
 * every authenticated page load via the (app) layout - that blocked every
 * navigation on an N+1 loop (one findFirst + optional update per due
 * follow-up) and has been moved to POST /api/internal/notifications/sweep,
 * run on a schedule (see vercel.json). Idempotent: a notification is only
 * created once per follow-up per type, so re-running it never duplicates
 * alerts - safe to call from a cron, a throttled lazy trigger, or a test.
 *
 * The existing-notification check is now one batched findMany instead of
 * one findFirst per follow-up, so a sweep with many due follow-ups no
 * longer issues 2 queries per row.
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

  if (dueFollowUps.length === 0) return { checked: 0, created: 0 };

  const existing = await prisma.notification.findMany({
    where: { followUpId: { in: dueFollowUps.map((f) => f.id) } },
    select: { followUpId: true, type: true },
  });
  const existingKeys = new Set(existing.map((n) => `${n.followUpId}:${n.type}`));

  let created = 0;
  for (const followUp of dueFollowUps) {
    if (!followUp.lead) continue;
    const isOverdue = followUp.status === "OVERDUE" || followUp.dueDate < startOfToday(now);
    const type: NotificationType = isOverdue ? "FOLLOW_UP_OVERDUE" : "FOLLOW_UP_DUE";

    if (existingKeys.has(`${followUp.id}:${type}`)) continue;

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
    created++;

    // Keep the FollowUp row's own status in sync so /follow-ups buckets and
    // the notification agree with each other.
    if (isOverdue && followUp.status !== "OVERDUE") {
      await prisma.followUp.update({ where: { id: followUp.id }, data: { status: "OVERDUE" } });
    }
  }

  return { checked: dueFollowUps.length, created };
}

function startOfToday(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

let sweepLockClient: Redis | null | undefined;
function getSweepLockClient(): Redis | null {
  if (sweepLockClient !== undefined) return sweepLockClient;
  const url = process.env.REDIS_URL;
  if (!url) {
    sweepLockClient = null;
    return null;
  }
  sweepLockClient = new Redis(url, { maxRetriesPerRequest: 1 });
  sweepLockClient.on("error", (err) => logger.error("redis_sweep_lock_error", { message: err.message }));
  return sweepLockClient;
}

const SWEEP_LOCK_KEY = "lock:notifications-sweep";

/**
 * Runs the due-follow-up sweep, but skips if another sweep (the Vercel Cron
 * trigger, or this same throttled fallback from a different request)
 * already ran within `lockTtlSeconds`. Shared by both callers so whichever
 * one wins the lock executes and the other yields - no duplicate work, no
 * duplicate notifications (generateDueFollowUpNotifications is itself
 * idempotent regardless, so this is an efficiency guard, not a correctness
 * requirement). Falls open (always runs) if Redis is unavailable.
 */
export async function runThrottledSweep(organizationId: string, lockTtlSeconds: number): Promise<{ ran: boolean }> {
  const redis = getSweepLockClient();
  if (redis) {
    try {
      const acquired = await redis.set(SWEEP_LOCK_KEY, "1", "EX", lockTtlSeconds, "NX");
      if (!acquired) return { ran: false };
    } catch (err) {
      logger.warn("sweep_lock_failed", { message: err instanceof Error ? err.message : String(err) });
    }
  }
  await generateDueFollowUpNotifications(organizationId);
  return { ran: true };
}
