import { prisma } from "./prisma";
import { getOrganizationId } from "./organization";
import { createNotification } from "./notifications";
import { logActivity } from "./activity";
import { logger } from "./logger";
import { recordAudit } from "./audit";
import { DEMO_ID_PREFIX } from "./demo-data/constants";
import type { AutomationActionType, AutomationRule, AutomationTrigger, FollowUpType } from "@prisma/client";

// ---------------------------------------------------------------------------
// CRUD (Phase 3, Module 8 - Automation Rules Engine)
// ---------------------------------------------------------------------------

export interface AutomationRuleInput {
  name: string;
  trigger: AutomationTrigger;
  actionType: AutomationActionType;
  actionConfig?: Record<string, unknown>;
  isActive?: boolean;
}

export async function listAutomationRules(organizationId?: string) {
  return prisma.automationRule.findMany({
    where: { organizationId: organizationId ?? getOrganizationId() },
    include: { createdBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createAutomationRule(params: AutomationRuleInput & { createdById: string }) {
  return prisma.automationRule.create({
    data: {
      organizationId: getOrganizationId(params.createdById),
      name: params.name,
      trigger: params.trigger,
      actionType: params.actionType,
      actionConfig: JSON.stringify(params.actionConfig ?? {}),
      // Every rule is created disabled by default, regardless of what the
      // caller passes - an Admin must explicitly flip it on after reviewing
      // (and ideally previewing) it. Matches "do not enable any automation
      // rule by default in production".
      isActive: false,
      createdById: params.createdById,
    },
  });
}

export async function updateAutomationRule(
  id: string,
  patch: Partial<{ isActive: boolean; name: string; actionConfig: Record<string, unknown> }>
) {
  return prisma.automationRule.update({
    where: { id },
    data: {
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.actionConfig !== undefined ? { actionConfig: JSON.stringify(patch.actionConfig) } : {}),
    },
  });
}

export async function deleteAutomationRule(id: string) {
  return prisma.automationRule.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Safety guards shared by both the real executor and the zero-write preview,
// so they can never drift apart - "what the preview shows" is guaranteed to
// be "what actually happens".
// ---------------------------------------------------------------------------

/**
 * Skips demo-seeded records (KP-DEMO-/kp-demo- prefixed ids, see
 * src/lib/demo-data/constants.ts) by default - an automation rule silently
 * reassigning or closing demo data would corrupt the curated demo dataset's
 * scenario ids. Opt-in only, via an explicit env var, for the rare case a
 * rule genuinely needs testing against demo data.
 */
const ALLOW_AUTOMATION_ON_DEMO_DATA = process.env.ALLOW_AUTOMATION_ON_DEMO_DATA === "true";

export function isDemoRecordId(id: string): boolean {
  return id.startsWith(DEMO_ID_PREFIX) || id.toLowerCase().startsWith(DEMO_ID_PREFIX.toLowerCase());
}

function demoGuardBlocks(...ids: string[]): boolean {
  return !ALLOW_AUTOMATION_ON_DEMO_DATA && ids.some((id) => isDemoRecordId(id));
}

/** How long a just-created record of the same kind, from the same rule, suppresses a repeat action - the idempotency/dedup window required for CREATE_FOLLOW_UP and NOTIFY_EMPLOYEE (ASSIGN_EMPLOYEE and MARK_DEAL_CLOSED are naturally idempotent via their own state checks below). */
const DEDUP_WINDOW_MS = 30 * 60 * 1000;

/** Bounds every rule lookup and every preview sample - an org can have many rules/records, but a single trigger firing (or a preview) must never do unbounded work. */
const MAX_RULES_PER_TRIGGER = 20;
const PREVIEW_SAMPLE_SIZE = 20;

export interface EligibilityResult {
  eligible: boolean;
  reason: string;
}

/**
 * Pure-ish eligibility check (reads only, no writes) for one rule against
 * one context - the single source of truth for "would this rule fire",
 * used by both executeAction (which then performs the write) and
 * previewAutomationRule (which never does). Keeping this as one function
 * is what guarantees preview accuracy: there is no second copy of this
 * logic to drift out of sync.
 */
async function checkEligibility(rule: Pick<AutomationRule, "actionType">, config: Record<string, unknown>, context: AutomationContext): Promise<EligibilityResult> {
  switch (rule.actionType) {
    case "ASSIGN_EMPLOYEE": {
      if (context.trigger !== "LEAD_CREATED") return { eligible: false, reason: "Rule's action does not apply to this trigger" };
      if (demoGuardBlocks(context.leadId)) return { eligible: false, reason: "Demo-seeded record - skipped by default" };
      const employeeId = typeof config.employeeId === "string" ? config.employeeId : null;
      if (!employeeId) return { eligible: false, reason: "Rule has no employeeId configured" };
      const lead = await prisma.lead.findUnique({ where: { id: context.leadId }, select: { assignedToId: true } });
      if (!lead) return { eligible: false, reason: "Lead not found" };
      if (lead.assignedToId) return { eligible: false, reason: "Lead is already assigned - never overrides an existing assignment" };
      return { eligible: true, reason: `Would assign to employee ${employeeId}` };
    }
    case "CREATE_FOLLOW_UP": {
      if (context.trigger !== "VISIT_COMPLETED") return { eligible: false, reason: "Rule's action does not apply to this trigger" };
      if (demoGuardBlocks(context.leadId, context.visitId)) return { eligible: false, reason: "Demo-seeded record - skipped by default" };
      const visit = await prisma.visit.findUnique({ where: { id: context.visitId }, select: { id: true } });
      if (!visit) return { eligible: false, reason: "Visit not found" };
      const recent = await prisma.followUp.findFirst({
        where: { leadId: context.leadId, notes: { contains: "Auto-created after visit completion" }, createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) } },
        select: { id: true },
      });
      if (recent) return { eligible: false, reason: "A follow-up was already auto-created for this lead within the last 30 minutes - skipped to avoid duplicates" };
      return { eligible: true, reason: "Would create a follow-up" };
    }
    case "NOTIFY_EMPLOYEE": {
      if (context.trigger !== "CATALOGUE_OPENED") return { eligible: false, reason: "Rule's action does not apply to this trigger" };
      if (demoGuardBlocks(context.leadId, context.catalogueShareId)) return { eligible: false, reason: "Demo-seeded record - skipped by default" };
      const lead = await prisma.lead.findUnique({ where: { id: context.leadId }, select: { assignedToId: true } });
      if (!lead?.assignedToId) return { eligible: false, reason: "Lead has no assigned employee to notify" };
      const recent = await prisma.notification.findFirst({
        where: { leadId: context.leadId, userId: lead.assignedToId, type: "CATALOGUE_VIEWED", createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) } },
        select: { id: true },
      });
      if (recent) return { eligible: false, reason: "This employee was already notified about this lead's catalogue within the last 30 minutes - skipped to avoid duplicates" };
      return { eligible: true, reason: `Would notify employee ${lead.assignedToId}` };
    }
    case "MARK_DEAL_CLOSED": {
      if (context.trigger !== "PAYMENT_RECEIVED") return { eligible: false, reason: "Rule's action does not apply to this trigger" };
      if (demoGuardBlocks(context.dealId)) return { eligible: false, reason: "Demo-seeded record - skipped by default" };
      const deal = await prisma.deal.findUnique({ where: { id: context.dealId }, select: { status: true } });
      if (!deal) return { eligible: false, reason: "Deal not found" };
      if (deal.status !== "OPEN") return { eligible: false, reason: `Deal is already ${deal.status} - not re-closed` };
      return { eligible: true, reason: "Would mark the deal WON / CLOSED_WON" };
    }
    default:
      return { eligible: false, reason: "Unknown action type" };
  }
}

// ---------------------------------------------------------------------------
// Executor
//
// Deliberately small and deterministic - each actionType is one hand-written
// case, never arbitrary code. Runs best-effort: one failing rule is logged
// and swallowed, never bubbled up to block the triggering request (a broken
// automation rule must not stop a lead from being created, a visit from
// being marked complete, etc). No recursive trigger loops are possible:
// executeAction() never calls runAutomationRules() itself, and none of the
// four action types write to a field that itself fires one of the four
// triggers (LEAD_CREATED/VISIT_COMPLETED/CATALOGUE_OPENED/PAYMENT_RECEIVED
// are each raised from exactly one call site, none of which this file calls).
// ---------------------------------------------------------------------------

export type AutomationContext =
  | { trigger: "LEAD_CREATED"; leadId: string; organizationId: string }
  | { trigger: "VISIT_COMPLETED"; visitId: string; leadId: string; organizationId: string }
  | { trigger: "CATALOGUE_OPENED"; catalogueShareId: string; leadId: string; organizationId: string }
  | { trigger: "PAYMENT_RECEIVED"; paymentId: string; dealId: string; organizationId: string };

export async function runAutomationRules(context: AutomationContext): Promise<void> {
  let rules;
  try {
    rules = await prisma.automationRule.findMany({
      where: { organizationId: context.organizationId, trigger: context.trigger, isActive: true },
      take: MAX_RULES_PER_TRIGGER,
    });
  } catch (err) {
    logger.error("automation_rules_lookup_failed", { trigger: context.trigger, message: err instanceof Error ? err.message : String(err) });
    return;
  }

  for (const rule of rules) {
    try {
      const config = JSON.parse(rule.actionConfig) as Record<string, unknown>;
      const eligibility = await checkEligibility(rule, config, context);
      if (!eligibility.eligible) {
        await recordAudit({ action: "OTHER", entityType: "AutomationRule", entityId: rule.id, newValues: { event: "automation_rule_skipped", trigger: context.trigger, reason: eligibility.reason } });
        continue;
      }
      await executeAction(rule.actionType, config, context);
      await recordAudit({ action: "OTHER", entityType: "AutomationRule", entityId: rule.id, newValues: { event: "automation_rule_executed", trigger: context.trigger } });
    } catch (err) {
      logger.error("automation_rule_execution_failed", {
        ruleId: rule.id,
        trigger: context.trigger,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

async function executeAction(actionType: AutomationActionType, config: Record<string, unknown>, context: AutomationContext): Promise<void> {
  switch (actionType) {
    case "ASSIGN_EMPLOYEE": {
      if (context.trigger !== "LEAD_CREATED") return;
      const employeeId = config.employeeId as string;
      await prisma.lead.update({ where: { id: context.leadId }, data: { assignedToId: employeeId, assignmentReason: "Automation rule" } });
      await logActivity({ leadId: context.leadId, type: "LEAD_ASSIGNED", description: "Assigned automatically by an automation rule" });
      await createNotification({
        organizationId: context.organizationId,
        userId: employeeId,
        type: "LEAD_ASSIGNED",
        title: "New lead assigned",
        message: "A new lead was assigned to you by an automation rule.",
        leadId: context.leadId,
      });
      return;
    }
    case "CREATE_FOLLOW_UP": {
      if (context.trigger !== "VISIT_COMPLETED") return;
      const dueInHours = typeof config.dueInHours === "number" ? config.dueInHours : 24;
      const type = (typeof config.followUpType === "string" ? config.followUpType : "PHONE_CALL") as FollowUpType;
      const visit = await prisma.visit.findUnique({ where: { id: context.visitId } });
      if (!visit) return;
      await prisma.followUp.create({
        data: {
          organizationId: context.organizationId,
          leadId: context.leadId,
          ownerId: visit.assignedToId,
          type,
          dueDate: new Date(Date.now() + dueInHours * 60 * 60 * 1000),
          notes: typeof config.notes === "string" ? config.notes : "Auto-created after visit completion",
        },
      });
      await logActivity({ leadId: context.leadId, type: "FOLLOW_UP_SCHEDULED", description: "Follow-up auto-created by an automation rule after visit completion" });
      return;
    }
    case "NOTIFY_EMPLOYEE": {
      if (context.trigger !== "CATALOGUE_OPENED") return;
      const lead = await prisma.lead.findUnique({ where: { id: context.leadId } });
      if (!lead?.assignedToId) return;
      await createNotification({
        organizationId: context.organizationId,
        userId: lead.assignedToId,
        type: "CATALOGUE_VIEWED",
        title: typeof config.title === "string" ? config.title : "Catalogue opened",
        message: typeof config.message === "string" ? config.message : "Your client just opened their shared property catalogue.",
        leadId: context.leadId,
      });
      return;
    }
    case "MARK_DEAL_CLOSED": {
      if (context.trigger !== "PAYMENT_RECEIVED") return;
      const deal = await prisma.deal.findUnique({ where: { id: context.dealId } });
      if (!deal || deal.status !== "OPEN") return;
      await prisma.deal.update({ where: { id: context.dealId }, data: { status: "WON", stage: "CLOSED_WON", closedAt: new Date() } });
      if (deal.leadId) {
        await logActivity({ leadId: deal.leadId, type: "DEAL_WON", description: "Deal marked closed automatically after payment was received" });
      }
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Preview / "Test rule" - zero writes. Samples the most recent
// PREVIEW_SAMPLE_SIZE records for the rule's trigger type and reports, for
// each, whether the rule would fire and why/why not - using the exact same
// checkEligibility() the real executor uses, so preview can never lie about
// what would happen. Never calls executeAction.
// ---------------------------------------------------------------------------

export interface PreviewRow {
  recordId: string;
  label: string;
  wouldExecute: boolean;
  reason: string;
}

export interface AutomationRulePreview {
  ruleId: string;
  trigger: AutomationTrigger;
  actionType: AutomationActionType;
  sampleSize: number;
  matchedCount: number;
  skippedCount: number;
  rows: PreviewRow[];
}

async function sampleContextsForTrigger(organizationId: string, trigger: AutomationTrigger): Promise<{ context: AutomationContext; label: string }[]> {
  switch (trigger) {
    case "LEAD_CREATED": {
      const leads = await prisma.lead.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: PREVIEW_SAMPLE_SIZE, select: { id: true, leadCode: true, clientName: true } });
      return leads.map((l) => ({ context: { trigger, leadId: l.id, organizationId }, label: `${l.leadCode} - ${l.clientName}` }));
    }
    case "VISIT_COMPLETED": {
      const visits = await prisma.visit.findMany({ where: { organizationId, status: "COMPLETED" }, orderBy: { updatedAt: "desc" }, take: PREVIEW_SAMPLE_SIZE, select: { id: true, leadId: true, lead: { select: { leadCode: true } } } });
      return visits.map((v) => ({ context: { trigger, visitId: v.id, leadId: v.leadId, organizationId }, label: `Visit for ${v.lead.leadCode}` }));
    }
    case "CATALOGUE_OPENED": {
      const shares = await prisma.catalogueShare.findMany({ where: { organizationId, viewCount: { gt: 0 } }, orderBy: { lastViewedAt: "desc" }, take: PREVIEW_SAMPLE_SIZE, select: { id: true, leadId: true, title: true } });
      return shares.map((s) => ({ context: { trigger, catalogueShareId: s.id, leadId: s.leadId, organizationId }, label: s.title }));
    }
    case "PAYMENT_RECEIVED": {
      const payments = await prisma.payment.findMany({ where: { organizationId, status: "PAID" }, orderBy: { paidAt: "desc" }, take: PREVIEW_SAMPLE_SIZE, select: { id: true, dealId: true, deal: { select: { dealCode: true } } } });
      return payments.map((p) => ({ context: { trigger, paymentId: p.id, dealId: p.dealId, organizationId }, label: `Payment on ${p.deal.dealCode}` }));
    }
  }
}

/** Read-only. Never calls executeAction, never writes - safe to run against production at any time, including for a rule that is currently disabled. */
export async function previewAutomationRule(ruleId: string): Promise<AutomationRulePreview> {
  const rule = await prisma.automationRule.findUniqueOrThrow({ where: { id: ruleId } });
  const config = JSON.parse(rule.actionConfig) as Record<string, unknown>;
  const samples = await sampleContextsForTrigger(rule.organizationId, rule.trigger);

  const rows: PreviewRow[] = [];
  for (const sample of samples) {
    const result = await checkEligibility(rule, config, sample.context);
    rows.push({ recordId: recordIdOf(sample.context), label: sample.label, wouldExecute: result.eligible, reason: result.reason });
  }

  return {
    ruleId: rule.id,
    trigger: rule.trigger,
    actionType: rule.actionType,
    sampleSize: rows.length,
    matchedCount: rows.filter((r) => r.wouldExecute).length,
    skippedCount: rows.filter((r) => !r.wouldExecute).length,
    rows,
  };
}

function recordIdOf(context: AutomationContext): string {
  switch (context.trigger) {
    case "LEAD_CREATED": return context.leadId;
    case "VISIT_COMPLETED": return context.visitId;
    case "CATALOGUE_OPENED": return context.catalogueShareId;
    case "PAYMENT_RECEIVED": return context.paymentId;
  }
}
