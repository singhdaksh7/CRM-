import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { updateInventoryPartnerSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";
import { recordInventoryPartnerActivity, getActivePropertyCount } from "@/lib/inventory-partners";
import { recordAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const organizationId = getOrganizationId(session.user);

    const partner = await prisma.inventoryPartner.findFirst({
      where: { id, organizationId },
      include: {
        properties: { orderBy: { createdAt: "desc" } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!partner) throw new ApiError(404, "Inventory partner not found");

    const activePropertyCount = await getActivePropertyCount(id);
    return NextResponse.json({ inventoryPartner: { ...partner, activePropertyCount } });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    const organizationId = getOrganizationId(session.user);
    const existing = await prisma.inventoryPartner.findFirst({ where: { id, organizationId } });
    if (!existing) throw new ApiError(404, "Inventory partner not found");

    const body = await req.json();
    const data = updateInventoryPartnerSchema.parse(body);

    const partner = await prisma.inventoryPartner.update({
      where: { id },
      data: {
        ...data,
        localities: data.localities ? JSON.stringify(data.localities) : undefined,
        lastInventoryUpdateAt: new Date(),
      },
    });

    await recordInventoryPartnerActivity({
      inventoryPartnerId: id,
      type: "INVENTORY_PARTNER_UPDATED",
      description: `Inventory partner ${partner.name} details updated`,
      actorId: session.user.id,
    });
    await recordAudit({
      userId: session.user.id,
      action: "UPDATE",
      entityType: "InventoryPartner",
      entityId: id,
      oldValues: existing,
      newValues: data,
    });

    return NextResponse.json({ inventoryPartner: partner });
  } catch (err) {
    return handleApiError(err);
  }
}
