import { prisma } from "./prisma";

/**
 * Append-only complete property history (Phase 4). Never updated or
 * deleted - every property lifecycle event (status changes, catalogue
 * sends/views, visits, price/rent updates, verification decisions) gets one
 * row here via this single write path, so the full history is always in
 * one place and in order.
 */
export async function appendPropertyTimelineEvent(params: {
  organizationId: string;
  propertyId: string;
  eventType: string;
  fromValue?: string | null;
  toValue?: string | null;
  note?: string | null;
  actorId?: string | null;
}): Promise<void> {
  await prisma.propertyTimelineEvent.create({
    data: {
      organizationId: params.organizationId,
      propertyId: params.propertyId,
      eventType: params.eventType,
      fromValue: params.fromValue ?? null,
      toValue: params.toValue ?? null,
      note: params.note ?? null,
      actorId: params.actorId ?? null,
    },
  });
}

/** Oldest first, matching how a timeline reads naturally. */
export async function getPropertyTimeline(propertyId: string) {
  return prisma.propertyTimelineEvent.findMany({
    where: { propertyId },
    orderBy: { createdAt: "asc" },
    include: { actor: { select: { id: true, name: true, role: true } } },
  });
}
