import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { customerContactSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";
import { normalizeIndianPhone } from "@/integrations/whatsapp/phone";
import { recordAudit } from "@/lib/audit";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user);
    const { id } = await params;
    const contact = await prisma.customerContact.findFirst({
      where: { id, organizationId },
      include: {
        requirements: { orderBy: { createdAt: "desc" }, include: { convertedLead: { select: { id: true, leadCode: true, status: true } } } },
        leads: { select: { id: true, leadCode: true, status: true, createdAt: true } },
        recommendations: { orderBy: { createdAt: "desc" }, take: 50, include: { property: { select: { id: true, title: true, area: true, propertyCode: true } } } },
      },
    });
    if (!contact) throw new ApiError(404, "Contact not found");
    return NextResponse.json({ contact });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const organizationId = getOrganizationId(session.user);
    const { id } = await params;
    const existing = await prisma.customerContact.findFirst({ where: { id, organizationId } });
    if (!existing) throw new ApiError(404, "Contact not found");

    const body = customerContactSchema.partial().parse(await req.json());
    const data: Record<string, unknown> = { ...body };
    if (body.tags) data.tags = JSON.stringify(body.tags);
    if (body.email === "") data.email = null;
    if (body.phone) {
      const normalizedPhone = normalizeIndianPhone(body.phone);
      if (!normalizedPhone) return NextResponse.json({ error: "Invalid Indian mobile number" }, { status: 400 });
      const dupe = await prisma.customerContact.findUnique({ where: { organizationId_normalizedPhone: { organizationId, normalizedPhone } } });
      if (dupe && dupe.id !== id) return NextResponse.json({ error: "Another contact already has this phone number" }, { status: 409 });
      data.normalizedPhone = normalizedPhone;
    }

    const contact = await prisma.customerContact.update({ where: { id }, data });
    await recordAudit({ userId: session.user.id, action: "UPDATE", entityType: "CustomerContact", entityId: id, oldValues: { status: existing.status, doNotContact: existing.doNotContact, whatsAppOptOut: existing.whatsAppOptOut }, newValues: { status: contact.status, doNotContact: contact.doNotContact, whatsAppOptOut: contact.whatsAppOptOut } });
    return NextResponse.json({ contact });
  } catch (err) {
    return handleApiError(err);
  }
}
