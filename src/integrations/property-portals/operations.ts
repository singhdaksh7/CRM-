import "server-only";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import type { PropertyPortalProviderId } from "./registry";

const MAX_ATTEMPTS = 3;
export type SupportedConflict = "price" | "availability" | "listingMetadata" | "providerSyncState";

export function conflictFields(crm: Record<string, unknown>, portal: Record<string, unknown>): SupportedConflict[] {
  const fields: Array<[SupportedConflict, string[]]> = [["price", ["price", "monthlyRent", "salePrice"]], ["availability", ["status", "availableFrom"]], ["listingMetadata", ["title", "description", "locality"]], ["providerSyncState", ["syncState"]]];
  return fields.filter(([, keys]) => keys.some((key) => key in portal && crm[key] !== portal[key])).map(([field]) => field);
}

export async function detectListingConflict(organizationId: string, listingId: string, crm: Record<string, unknown>, portal: Record<string, unknown>) {
  const fields = conflictFields(crm, portal);
  if (!fields.length) return null;
  return prisma.portalListing.update({ where: { id: listingId, organizationId }, data: { status: "SYNC_CONFLICT", conflictFields: JSON.stringify(fields), portalSnapshot: JSON.stringify(portal), conflictDetectedAt: new Date(), conflictResolution: null, conflictResolvedAt: null, conflictResolvedById: null } });
}

export async function resolveListingConflict(organizationId: string, listingId: string, resolution: "KEEP_CRM" | "ACCEPT_PORTAL" | "REVIEW", actorId: string) {
  // ACCEPT_PORTAL is deliberately recorded for a human workflow; field application belongs
  // to an authorized, provider-specific adapter and is never a silent overwrite.
  return prisma.portalListing.update({ where: { id: listingId, organizationId }, data: { conflictResolution: resolution, conflictResolvedAt: new Date(), conflictResolvedById: actorId, ...(resolution === "REVIEW" ? {} : { status: "PUBLISHED" }) } });
}

export async function recordFailedOperation(input: { organizationId: string; provider: PropertyPortalProviderId; operationType: string; portalListingId?: string; connectionId?: string; request: unknown; failureReason: string }) {
  const idempotencyKey = createHash("sha256").update(`${input.provider}:${input.operationType}:${JSON.stringify(input.request)}`).digest("hex");
  const attempts = 1;
  return prisma.portalOperation.upsert({ where: { organizationId_idempotencyKey: { organizationId: input.organizationId, idempotencyKey } }, create: { ...input, idempotencyKey, status: "RETRYABLE", attemptCount: attempts, lastAttemptAt: new Date(), retryEligibleAt: new Date() }, update: { failureReason: input.failureReason, attemptCount: { increment: 1 }, lastAttemptAt: new Date(), status: "RETRYABLE", retryEligibleAt: new Date() } });
}

export async function retryPortalOperation(organizationId: string, operationId: string) {
  const operation = await prisma.portalOperation.findFirstOrThrow({ where: { id: operationId, organizationId } });
  if (operation.status === "SUCCEEDED" || operation.status === "DEAD_LETTER") throw new Error("Operation is not retryable");
  const nextAttempt = operation.attemptCount + 1;
  return prisma.portalOperation.update({ where: { id: operation.id }, data: { attemptCount: nextAttempt, lastAttemptAt: new Date(), status: nextAttempt >= MAX_ATTEMPTS ? "DEAD_LETTER" : "RETRYABLE", retryEligibleAt: nextAttempt >= MAX_ATTEMPTS ? null : new Date(Date.now() + nextAttempt * 60_000) } });
}
