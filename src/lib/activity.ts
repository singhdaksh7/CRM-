import { prisma } from "./prisma";
import type { ActivityType } from "@prisma/client";

export async function logActivity(params: {
  leadId: string;
  type: ActivityType;
  description: string;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return prisma.activity.create({
    data: {
      leadId: params.leadId,
      type: params.type,
      description: params.description,
      actorId: params.actorId ?? null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    },
  });
}
