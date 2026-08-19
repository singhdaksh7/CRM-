import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { customerContactSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";
import { normalizeIndianPhone } from "@/integrations/whatsapp/phone";
import { recordAudit } from "@/lib/audit";
import type { Prisma } from "@prisma/client";

// GET /api/customers - demand pool workspace list, org-scoped, filterable.
// All roles (including FIELD_EXECUTIVE) may read the demand pool - rule 37
// only restricts FIELD_EXECUTIVE from bulk broadcast/export, not from view.
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user.id);
    const sp = req.nextUrl.searchParams;
    const where: Prisma.CustomerContactWhereInput = { organizationId };

    const q = sp.get("q");
    if (q) where.OR = [{ name: { contains: q } }, { phone: { contains: q } }, { email: { contains: q } }];
    const status = sp.get("status");
    if (status) where.status = status as Prisma.EnumContactStatusFilter["equals"];
    const whatsAppOptOut = sp.get("whatsAppOptOut");
    if (whatsAppOptOut === "true") where.whatsAppOptOut = true;
    const neverContacted = sp.get("neverContacted");
    if (neverContacted === "true") where.lastContactedAt = null;
    const hasLead = sp.get("hasLead");
    if (hasLead === "true") where.leads = { some: {} };
    if (hasLead === "false") where.leads = { none: {} };

    const assetClass = sp.get("assetClass");
    const transactionType = sp.get("transactionType");
    const locality = sp.get("locality");
    const activeRequirementOnly = sp.get("activeRequirement") !== "false";
    if (assetClass || transactionType || locality) {
      where.requirements = {
        some: {
          ...(activeRequirementOnly ? { active: true } : {}),
          ...(assetClass ? { assetClass: assetClass as Prisma.EnumAssetClassFilter["equals"] } : {}),
          ...(transactionType ? { transactionType: transactionType as Prisma.EnumTransactionTypeFilter["equals"] } : {}),
          ...(locality ? { preferredLocalities: { contains: locality } } : {}),
        },
      };
    }

    const [contacts, total] = await Promise.all([
      prisma.customerContact.findMany({
        where,
        include: {
          requirements: { where: { active: true }, orderBy: { createdAt: "desc" } },
          leads: { select: { id: true, leadCode: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.customerContact.count({ where }),
    ]);

    return NextResponse.json({ contacts, total });
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/customers - create a contact. Dedupe on normalizedPhone within
// the org (rule 7): if the phone already exists, reuse the existing contact
// rather than creating a duplicate identity.
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const organizationId = getOrganizationId(session.user.id);
    const body = customerContactSchema.parse(await req.json());
    const normalizedPhone = normalizeIndianPhone(body.phone);
    if (!normalizedPhone) return NextResponse.json({ error: "Invalid Indian mobile number" }, { status: 400 });

    const existing = await prisma.customerContact.findUnique({ where: { organizationId_normalizedPhone: { organizationId, normalizedPhone } } });
    if (existing) return NextResponse.json({ contact: existing, deduped: true }, { status: 200 });

    const contact = await prisma.customerContact.create({
      data: {
        organizationId,
        name: body.name,
        phone: body.phone,
        normalizedPhone,
        email: body.email || null,
        source: body.source,
        notes: body.notes ?? null,
        tags: JSON.stringify(body.tags),
        status: body.status,
        doNotContact: body.doNotContact,
        whatsAppOptOut: body.whatsAppOptOut,
        createdById: session.user.id,
      },
    });
    await recordAudit({ userId: session.user.id, action: "CREATE", entityType: "CustomerContact", entityId: contact.id, newValues: { name: contact.name, normalizedPhone: contact.normalizedPhone } });
    return NextResponse.json({ contact, deduped: false }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
