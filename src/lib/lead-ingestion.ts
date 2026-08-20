import { prisma } from "./prisma";
import { generateCode } from "./utils";
import { logActivity } from "./activity";
import { getSystemOrganizationId } from "./organization";
import { autoAssignLead } from "./assignment";
import { recalculateLeadScore } from "./scoring";
import { runMatchingForLead } from "./lead-matching";
import { notifyRoles } from "./notifications";
import { ApiError } from "./api-auth";
import { logger } from "./logger";
import type { z } from "zod";
import type { mockWebhookLeadSchema } from "./validators";
import type { LeadSource } from "@prisma/client";

type WebhookLeadInput = z.infer<typeof mockWebhookLeadSchema>;

/**
 * Shared pipeline for every mock external-lead webhook (99acres, Magicbricks,
 * and any future source): validate -> dedupe by externalLeadId -> create ->
 * auto-assign -> score -> activity -> notify admins/data managers.
 *
 * Centralised here so 2A's automation (scoring/auto-assign/notifications)
 * only had to be wired once instead of once per integration route.
 */
export async function ingestWebhookLead(data: WebhookLeadInput, source: LeadSource) {
  // Inbound external-portal webhook, no CRM user session - trusted system context.
  const organizationId = getSystemOrganizationId();

  const existing = await prisma.lead.findUnique({ where: { externalLeadId: data.externalLeadId } });
  if (existing) throw new ApiError(409, "Duplicate lead - externalLeadId already ingested");

  const count = await prisma.lead.count({ where: { organizationId } });
  const lead = await prisma.lead.create({
    data: {
      organizationId,
      leadCode: generateCode("LEAD", count + 1),
      clientName: data.clientName,
      phone: data.phone,
      email: data.email ?? null,
      source,
      externalLeadId: data.externalLeadId,
      requirementType: data.requirementType,
      preferredLocation: data.location,
      minBudget: data.minimumBudget,
      maxBudget: data.maximumBudget,
      preferredBhk: data.bhk ?? null,
      furnishingPref: data.furnishing ?? null,
      additionalRequirements: data.notes ?? null,
      status: "NEW",
      priority: "WARM",
    },
  });

  await logActivity({ leadId: lead.id, type: "LEAD_RECEIVED", description: `Lead received via ${source.replace(/_/g, " ")} webhook` });

  const assignment = await autoAssignLead(lead.id, organizationId);
  const score = await recalculateLeadScore(lead.id, "LEAD_CREATED");

  try {
    await runMatchingForLead(lead.id, "created");
  } catch (err) {
    logger.error("lead_matching_failed", { leadId: lead.id, message: err instanceof Error ? err.message : String(err) });
  }

  await notifyRoles(["ADMIN", "DATA_MANAGER"], {
    organizationId,
    type: "NEW_LEAD",
    title: "New lead received",
    message: `${lead.clientName} - ${lead.preferredLocation} (${source.replace(/_/g, " ")})`,
    leadId: lead.id,
  });

  const finalLead = await prisma.lead.findUnique({ where: { id: lead.id }, include: { assignedTo: true } });
  logger.info("lead_webhook_ingested", { leadId: lead.id, source, externalLeadId: data.externalLeadId, assigned: !!assignment });
  return { lead: finalLead, assignment, score };
}
