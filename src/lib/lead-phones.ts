import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { normalizeIndianPhone } from "@/integrations/whatsapp";
import type { LeadPhoneType } from "@prisma/client";

/**
 * simplified-role-workflow (spec item 5) - multiple phone numbers per Lead.
 * All reads/writes go through here so normalization, dedupe, and the
 * "at most one PRIMARY per lead" rule are enforced identically everywhere,
 * the same reuse pattern as assertLeadAccessible for lead-scoping.
 *
 * Deliberately does NOT merge/dedupe across leads: two different Lead rows
 * may legitimately share a phone number, matching the existing
 * warn-don't-merge behavior in POST /api/leads for Lead.phone itself.
 */

export function normalizeOrThrow(rawPhone: string): string {
  const normalized = normalizeIndianPhone(rawPhone);
  if (!normalized) throw new ApiError(400, "Enter a valid 10-digit Indian mobile number");
  return normalized;
}

export async function listLeadPhones(organizationId: string, leadId: string) {
  return prisma.leadPhone.findMany({
    where: { organizationId, leadId },
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
  });
}

/**
 * Returns every phone number associated with a lead - the legacy primary
 * `Lead.phone` column plus every LeadPhone row - for callers that need to
 * check "does this lead own this number" (e.g. inbound WhatsApp matching)
 * without caring which column it came from.
 */
export async function getAllLeadPhoneNumbers(organizationId: string, leadId: string): Promise<string[]> {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId }, select: { phone: true } });
  const extra = await prisma.leadPhone.findMany({ where: { organizationId, leadId }, select: { phone: true } });
  const numbers = new Set<string>();
  if (lead?.phone) numbers.add(lead.phone);
  for (const row of extra) numbers.add(row.phone);
  return [...numbers];
}

export async function addLeadPhone(params: {
  organizationId: string;
  leadId: string;
  phone: string;
  type?: LeadPhoneType;
  label?: string | null;
  createdById?: string | null;
}) {
  const { organizationId, leadId } = params;
  const normalized = normalizeOrThrow(params.phone);

  const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId }, select: { id: true, phone: true } });
  if (!lead) throw new ApiError(404, "Lead not found");
  if (lead.phone === normalized) {
    throw new ApiError(409, "This is already the lead's primary phone number");
  }

  const existing = await prisma.leadPhone.findFirst({ where: { organizationId, leadId, phone: normalized } });
  if (existing) throw new ApiError(409, "This number is already saved for this lead");

  const type = params.type ?? "ALTERNATE";
  if (type === "PRIMARY") {
    // At most one PRIMARY LeadPhone row per lead - enforced here rather than
    // a DB constraint (see migration notes). Demote any existing PRIMARY row
    // to ALTERNATE rather than rejecting the request outright.
    await prisma.leadPhone.updateMany({ where: { organizationId, leadId, type: "PRIMARY" }, data: { type: "ALTERNATE" } });
  }

  return prisma.leadPhone.create({
    data: {
      organizationId,
      leadId,
      phone: normalized,
      type,
      label: params.label ?? null,
      createdById: params.createdById ?? null,
    },
  });
}

export async function deleteLeadPhone(organizationId: string, leadId: string, phoneId: string) {
  const row = await prisma.leadPhone.findFirst({ where: { id: phoneId, organizationId, leadId } });
  if (!row) throw new ApiError(404, "Phone number not found");
  await prisma.leadPhone.delete({ where: { id: row.id } });
}
