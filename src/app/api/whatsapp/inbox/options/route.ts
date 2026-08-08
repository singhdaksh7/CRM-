import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { listWhatsAppTemplates } from "@/integrations/whatsapp/whatsapp-templates";
import { getWhatsAppConfigStatus } from "@/integrations/whatsapp/whatsapp-config";

export async function GET() {
  try {
    const session = await requireSession(); const organizationId = getOrganizationId(session.user.id);
    const [leads, employees, catalogues, properties] = await Promise.all([
      prisma.lead.findMany({ where: { organizationId, ...(session.user.role === "FIELD_EXECUTIVE" ? { assignedToId: session.user.id } : {}) }, orderBy: { clientName: "asc" }, take: 200, select: { id: true, clientName: true, phone: true, leadCode: true } }),
      prisma.user.findMany({ where: { organizationId, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true } }),
      prisma.catalogueShare.findMany({ where: { organizationId, status: "ACTIVE", ...(session.user.role === "FIELD_EXECUTIVE" ? { lead: { assignedToId: session.user.id } } : {}) }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, title: true, leadId: true, version: true } }),
      prisma.property.findMany({ where: { organizationId, status: "AVAILABLE" }, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, title: true, area: true, bhk: true } }),
    ]);
    const config = getWhatsAppConfigStatus();
    return NextResponse.json({ leads, employees, catalogues, properties, templates: listWhatsAppTemplates().map(({ name, useCase, approved, variables, bodyTemplate }) => ({ name, useCase, approved, variables, bodyTemplate })), provider: config.provider });
  } catch (error) { return handleApiError(error); }
}
