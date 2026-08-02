import { createHash } from "crypto";
import { prisma } from "./prisma";
import { getOrganizationId } from "./organization";
import { Prisma } from "@prisma/client";

export function hashPayload(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Records a webhook event exactly once per (provider, externalEventId).
 * Relies on the unique index rather than a read-then-write check to stay
 * correct under concurrent deliveries (WhatsApp providers routinely retry
 * webhooks). Returns isNew=false for any duplicate delivery - the caller
 * should skip re-processing (but still return 200 quickly, per Meta's
 * webhook contract).
 */
export async function recordWebhookEventOnce(params: {
  provider: string;
  externalEventId: string;
  eventType: string;
  payloadHash: string;
}): Promise<{ isNew: boolean }> {
  try {
    await prisma.integrationWebhookEvent.create({
      data: {
        organizationId: getOrganizationId(),
        provider: params.provider,
        externalEventId: params.externalEventId,
        eventType: params.eventType,
        payloadHash: params.payloadHash,
        status: "RECEIVED",
      },
    });
    return { isNew: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { isNew: false };
    }
    throw err;
  }
}

export async function markWebhookEventProcessed(provider: string, externalEventId: string, status: "PROCESSED" | "IGNORED" | "FAILED", errorMessage?: string) {
  await prisma.integrationWebhookEvent.update({
    where: { provider_externalEventId: { provider, externalEventId } },
    data: { status, processedAt: new Date(), errorMessage },
  });
}
