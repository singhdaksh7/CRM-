import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]);
    const organizationId = getOrganizationId(session.user);
    const provider = request.nextUrl.searchParams.get("provider");
    const status = request.nextUrl.searchParams.get("status");
    const where = { organizationId, ...(provider ? { provider: provider as never } : {}), ...(status ? { ingestionStatus: status as never } : {}) };
    const events = await prisma.externalLeadEvent.findMany({ where, include: { lead: { select: { id: true, leadCode: true, clientName: true, assignedToId: true } }, portalListing: { select: { id: true, externalUrl: true, propertyId: true } } }, orderBy: { receivedAt: "desc" }, take: 200 });
    const visible = session.user.role === "FIELD_EXECUTIVE" ? events.filter((event) => event.lead?.assignedToId === session.user.id) : events;
    return NextResponse.json({ events: visible });
  } catch (error) { return handleApiError(error); }
}
