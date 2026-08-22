import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { normalizeIndianPhone } from "@/integrations/whatsapp";
import { Prisma, type LeadPhoneType } from "@prisma/client";

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

  const type = params.type ?? "ALTERNATE";

  try {
    // targeted fix pass (Correctness issue C) - the demote-then-create used
    // to be two separate awaited calls. Under two concurrent "make primary"
    // requests, both could pass the demote step before either's create ran,
    // leaving two PRIMARY rows for the same lead. Bundling both statements
    // into ONE transaction closes that window: whichever request's
    // transaction commits second necessarily sees the first one's already-
    // demoted row (Prisma's default transaction isolation serializes
    // conflicting writes to the same rows), so at most one PRIMARY can ever
    // survive. The demote step only runs when the new row is itself PRIMARY -
    // adding a plain ALTERNATE number must never touch the existing PRIMARY.
    const operations: Prisma.PrismaPromise<unknown>[] = [];
    if (type === "PRIMARY") {
      operations.push(prisma.leadPhone.updateMany({ where: { organizationId, leadId, type: "PRIMARY" }, data: { type: "ALTERNATE" } }));
    }
    operations.push(
      prisma.leadPhone.create({
        data: {
          organizationId,
          leadId,
          phone: normalized,
          type,
          label: params.label ?? null,
          createdById: params.createdById ?? null,
        },
      })
    );

    const results = await prisma.$transaction(operations);
    return results[results.length - 1] as Awaited<ReturnType<typeof prisma.leadPhone.create>>;
  } catch (err) {
    // The DB's own @@unique([organizationId, leadId, phone]) constraint -
    // not a separate findFirst-then-create check, which would itself race
    // under concurrent submissions of the same number - is the authoritative
    // duplicate guard. This turns that constraint violation into the same
    // clean 409 a duplicate always deserves, instead of an opaque 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ApiError(409, "This number is already saved for this lead");
    }
    throw err;
  }
}

export async function deleteLeadPhone(organizationId: string, leadId: string, phoneId: string) {
  const row = await prisma.leadPhone.findFirst({ where: { id: phoneId, organizationId, leadId } });
  if (!row) throw new ApiError(404, "Phone number not found");
  await prisma.leadPhone.delete({ where: { id: row.id } });
}
