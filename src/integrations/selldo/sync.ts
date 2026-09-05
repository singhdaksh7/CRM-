import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { createSelldoLead } from "./client";
import { isSelldoConfigured, isSelldoSrdConfigured } from "./config";

/**
 * Sell.Do sync outbox, built on the existing PortalOperation ledger (Part I
 * of the task) - one row per CRM lead needing sync, keyed so a retry never
 * double-submits. Sell.Do unavailability NEVER rolls back or deletes the
 * CRM lead: this module only ever reads a Lead that already exists and
 * records the outcome of trying to forward it; a failure here is always a
 * PortalOperation-ledger write, never a Lead-table write.
 */

const OPERATION_TYPE = "SELLDO_LEAD_SYNC";
const MAX_ATTEMPTS = 5;

function idempotencyKeyFor(leadId: string): string {
  return `selldo-lead-sync:${leadId}`;
}

function backoffMinutes(attemptCount: number): number {
  return Math.min(5 * Math.pow(3, Math.max(attemptCount - 1, 0)), 24 * 60);
}

function buildNote(leadId: string, adId: string | null): string {
  return adId
    ? `Lead received from OLX Dealer API. OLX Ad ID: ${adId}. CRM Lead ID: ${leadId}.`
    : `Lead received from OLX Dealer API. CRM Lead ID: ${leadId}.`;
}

interface AttemptContext {
  organizationId: string;
  leadId: string;
  connectionId?: string | null;
  attemptCount: number;
}

async function attempt(ctx: AttemptContext) {
  const now = new Date();
  const lead = await prisma.lead.findFirst({ where: { id: ctx.leadId, organizationId: ctx.organizationId }, select: { clientName: true, phone: true, email: true, externalListingId: true } });
  if (!lead) {
    // Lead no longer exists / doesn't belong to this org - nothing safe to sync. Dead-letter rather than retry forever.
    await prisma.portalOperation.update({ where: { organizationId_idempotencyKey: { organizationId: ctx.organizationId, idempotencyKey: idempotencyKeyFor(ctx.leadId) } }, data: { status: "DEAD_LETTER", failureReason: "Lead no longer found for this organization", attemptCount: { increment: 1 }, lastAttemptAt: now, retryEligibleAt: null } });
    return;
  }

  if (!isSelldoConfigured() || !isSelldoSrdConfigured()) {
    // Gracefully handled per the task: never crash, just record and back off - once an operator sets the env vars, the next retry cron pass will succeed.
    await prisma.portalOperation.update({
      where: { organizationId_idempotencyKey: { organizationId: ctx.organizationId, idempotencyKey: idempotencyKeyFor(ctx.leadId) } },
      data: { status: "RETRYABLE", failureReason: !isSelldoConfigured() ? "SELLDO_API_KEY not configured" : "SELLDO_SRD not configured", attemptCount: { increment: 1 }, lastAttemptAt: now, retryEligibleAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
    });
    return;
  }

  const outcome = await createSelldoLead({
    name: lead.clientName,
    email: lead.email ?? undefined,
    phone: lead.phone,
    note: buildNote(ctx.leadId, lead.externalListingId ?? null),
  });

  if (outcome.ok) {
    await prisma.portalOperation.update({ where: { organizationId_idempotencyKey: { organizationId: ctx.organizationId, idempotencyKey: idempotencyKeyFor(ctx.leadId) } }, data: { status: "SUCCEEDED", failureReason: null, attemptCount: { increment: 1 }, lastAttemptAt: now, retryEligibleAt: null, completedAt: now } });
    return;
  }

  const nextAttemptCount = ctx.attemptCount + 1;
  const reason = outcome.reason === "API_ERROR" ? `Sell.Do API error (status ${outcome.status})` : outcome.reason === "NETWORK_ERROR" ? `Sell.Do network error: ${outcome.message}` : outcome.reason;
  const deadLetter = nextAttemptCount >= MAX_ATTEMPTS;
  await prisma.portalOperation.update({
    where: { organizationId_idempotencyKey: { organizationId: ctx.organizationId, idempotencyKey: idempotencyKeyFor(ctx.leadId) } },
    data: {
      status: deadLetter ? "DEAD_LETTER" : "RETRYABLE",
      failureReason: reason.slice(0, 500),
      attemptCount: { increment: 1 },
      lastAttemptAt: now,
      retryEligibleAt: deadLetter ? null : new Date(now.getTime() + backoffMinutes(nextAttemptCount) * 60 * 1000),
    },
  });
  logger.warn("selldo_sync_attempt_failed", { leadId: ctx.leadId, attemptCount: nextAttemptCount, deadLetter, reason });
}

/**
 * Called inline right after a NEW OLX-originated lead is created
 * (best-effort, matching how ingestion.ts calls autoAssignLead). Creates the
 * outbox row first (idempotent on leadId) so even if the immediate attempt
 * throws, the row exists for the retry cron to pick up later - the CRM
 * lead itself is never touched.
 */
export async function syncSelldoForNewLead(leadId: string, organizationId: string, connectionId?: string | null): Promise<void> {
  const idempotencyKey = idempotencyKeyFor(leadId);
  const operation = await prisma.portalOperation.upsert({
    where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
    create: { organizationId, connectionId: connectionId ?? null, provider: "OLX", operationType: OPERATION_TYPE, idempotencyKey, status: "PENDING", attemptCount: 0 },
    update: {},
  });
  if (operation.status === "SUCCEEDED" || operation.status === "DEAD_LETTER") return; // already resolved - never double-submit
  await attempt({ organizationId, leadId, connectionId, attemptCount: operation.attemptCount });
}

export interface SelldoRetrySummary {
  attempted: number;
  succeeded: number;
  retryable: number;
  deadLettered: number;
}

/** Retry-cron entry point: re-attempts every RETRYABLE Sell.Do sync operation past its retryEligibleAt. */
export async function retryFailedSelldoOperations(limit = 50): Promise<SelldoRetrySummary> {
  const now = new Date();
  const due = await prisma.portalOperation.findMany({
    where: { operationType: OPERATION_TYPE, status: "RETRYABLE", retryEligibleAt: { lte: now } },
    orderBy: { retryEligibleAt: "asc" },
    take: limit,
  });
  const summary: SelldoRetrySummary = { attempted: 0, succeeded: 0, retryable: 0, deadLettered: 0 };
  for (const operation of due) {
    const leadId = operation.idempotencyKey.replace(/^selldo-lead-sync:/, "");
    summary.attempted++;
    await attempt({ organizationId: operation.organizationId, leadId, connectionId: operation.connectionId, attemptCount: operation.attemptCount });
    const updated = await prisma.portalOperation.findUnique({ where: { organizationId_idempotencyKey: { organizationId: operation.organizationId, idempotencyKey: operation.idempotencyKey } } });
    if (updated?.status === "SUCCEEDED") summary.succeeded++;
    else if (updated?.status === "DEAD_LETTER") summary.deadLettered++;
    else summary.retryable++;
  }
  return summary;
}
