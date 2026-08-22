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
    // to be two separate awaited calls. Bundling both statements into ONE
    // transaction closes the window where two concurrent "make primary"
    // requests could each demote-then-see-nothing-to-demote and both still
    // insert a PRIMARY row. This narrows the race but is NOT itself
    // sufficient under PostgreSQL's default READ COMMITTED isolation - see
    // the Blocker 3 comment on the LeadPhone model in schema.prisma and on
    // the lead_phones_one_primary_per_lead partial unique index in
    // prisma/migrations/20260822120000_simplified_role_workflow_additive/migration.sql,
    // which is the actual DB-level backstop this catch block's P2002
    // handling below is written against. The demote step only runs when the
    // new row is itself PRIMARY - adding a plain ALTERNATE number must never
    // touch the existing PRIMARY.
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
    // Two distinct DB-level unique constraints can both surface as P2002
    // here, and each deserves its own clean conflict response rather than a
    // generic 500 OR being conflated with the other:
    //   A. @@unique([organizationId, leadId, phone]) - the same number
    //      submitted twice for this lead (not a separate findFirst-then-
    //      create check, which would itself race under concurrent
    //      submissions of the same number - the DB constraint is the
    //      authoritative guard).
    //   B. lead_phones_one_primary_per_lead (raw-SQL partial unique index,
    //      see schema.prisma's LeadPhone doc comment and the migration) -
    //      two concurrent "make primary" requests both reached the INSERT;
    //      one wins, the other lands here. This is Blocker 3's actual
    //      backstop, not just a hypothetical.
    // Postgres reports the violated index/constraint name in the error
    // detail, which Prisma surfaces via err.meta.target; for a raw-SQL
    // index Prisma doesn't recognize from its own DMMF, target is the bare
    // index name string rather than a column-name array, so this checks for
    // both shapes.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = err.meta?.target;
      const targetText = Array.isArray(target) ? target.join(",") : String(target ?? "");
      if (targetText.includes("one_primary_per_lead")) {
        throw new ApiError(409, "Another phone number was just marked primary for this lead - refresh and try again");
      }
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
