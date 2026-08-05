import { prisma } from "./prisma";
import { getOrganizationId } from "./organization";
import { createNotification } from "./notifications";
import { logActivity } from "./activity";
import { logger } from "./logger";
import { recordAudit } from "./audit";
import type { AutomationActionType, AutomationTrigger, FollowUpType } from "@prisma/client";

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
      isActive: params.isActive ?? true,
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
// Executor
//
// Deliberately small and deterministic - each actionType is one hand-written
// case, never arbitrary code. Runs best-effort: one failing rule is logged
// and swallowed, never bubbled up to block the triggering request (a broken
// automation rule must not stop a lead from being created, a visit from
// being marked complete, etc).
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
    });
  } catch (err) {
    logger.error("automation_rules_lookup_failed", { trigger: context.trigger, message: err instanceof Error ? err.message : String(err) });
    return;
  }

  for (const rule of rules) {
    try {
      const config = JSON.parse(rule.actionConfig) as Record<string, unknown>;
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
      const employeeId = typeof config.employeeId === "string" ? config.employeeId : null;
      if (!employeeId) return;
      const lead = await prisma.lead.findUnique({ where: { id: context.leadId } });
      if (!lead || lead.assignedToId) return; // never override an existing assignment
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
