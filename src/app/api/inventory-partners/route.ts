import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { inventoryPartnerSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";
import { generateInventoryPartnerCode, recordInventoryPartnerActivity, getActivePropertyCountsByPartner } from "@/lib/inventory-partners";
import { recordAudit } from "@/lib/audit";
import { readTake, readSkip } from "@/lib/pagination";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user);
    const sp = req.nextUrl.searchParams;
    const where: Record<string, unknown> = { organizationId };

    const q = sp.get("q");
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { phone: { contains: q } },
        { company: { contains: q } },
        { partnerCode: { contains: q } },
      ];
    }
    const isActive = sp.get("isActive");
    if (isActive !== null) where.isActive = isActive === "true";

    // Partners store their dealing/operating localities as a JSON string
    // array (InventoryPartner.localities - see schema comment). A substring
    // match against that serialized column is deliberately how "where does
    // this dealer operate" is filtered rather than introducing a new
    // relation: it is the field the spec says already carries this data, and
    // a normalized join table is unwarranted for a handful of freeform area
    // names per partner. Case-insensitive (Postgres `mode: "insensitive"`).
    const locality = sp.get("locality")?.trim();
    if (locality) {
      where.localities = { contains: locality, mode: "insensitive" };
    }

    const take = readTake(sp);
    const skip = readSkip(sp);
    const [partners, total] = await Promise.all([
      prisma.inventoryPartner.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.inventoryPartner.count({ where }),
    ]);

    const activeCounts = await getActivePropertyCountsByPartner(partners.map((p) => p.id));
    const partnersWithStats = partners.map((p) => ({ ...p, activePropertyCount: activeCounts.get(p.id) ?? 0 }));

    return NextResponse.json({ inventoryPartners: partnersWithStats, total, take, skip });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const body = await req.json();
    const data = inventoryPartnerSchema.parse(body);
    const organizationId = getOrganizationId(session.user);
    const partnerCode = await generateInventoryPartnerCode();

    const partner = await prisma.inventoryPartner.create({
      data: {
        organizationId,
        partnerCode,
        name: data.name,
        company: data.company,
        phone: data.phone,
        alternatePhone: data.alternatePhone,
        localities: JSON.stringify(data.localities),
        notes: data.notes,
        commissionSplitPct: data.commissionSplitPct,
        isActive: data.isActive,
        createdById: session.user.id,
      },
    });

    await recordInventoryPartnerActivity({
      inventoryPartnerId: partner.id,
      type: "INVENTORY_PARTNER_CREATED",
      description: `Inventory partner ${partner.name} (${partner.partnerCode}) created`,
      actorId: session.user.id,
    });
    await recordAudit({
      userId: session.user.id,
      action: "CREATE",
      entityType: "InventoryPartner",
      entityId: partner.id,
      newValues: data,
    });

    return NextResponse.json({ inventoryPartner: partner }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
