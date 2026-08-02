import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { ownerSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";
import { generateOwnerCode, recordOwnerActivity } from "@/lib/owners";
import { recordAudit } from "@/lib/audit";
import { readTake, readSkip } from "@/lib/pagination";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user.id);
    const sp = req.nextUrl.searchParams;
    const where: Record<string, unknown> = { organizationId };

    const q = sp.get("q");
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { phone: { contains: q } },
        { email: { contains: q } },
        { ownerCode: { contains: q } },
      ];
    }
    const verificationStatus = sp.get("verificationStatus");
    if (verificationStatus) where.verificationStatus = verificationStatus;
    const city = sp.get("city");
    if (city) where.city = city;

    const take = readTake(sp);
    const skip = readSkip(sp);
    const [owners, total] = await Promise.all([
      prisma.owner.findMany({
        where,
        include: { _count: { select: { properties: true, deals: true, documents: true } } },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.owner.count({ where }),
    ]);
    return NextResponse.json({ owners, total, take, skip });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const body = await req.json();
    const data = ownerSchema.parse(body);
    const organizationId = getOrganizationId(session.user.id);
    const ownerCode = await generateOwnerCode();

    const owner = await prisma.owner.create({
      data: {
        organizationId,
        ownerCode,
        name: data.name,
        phone: data.phone,
        alternatePhone: data.alternatePhone,
        email: data.email || null,
        address: data.address,
        city: data.city,
        notes: data.notes,
        createdById: session.user.id,
      },
    });

    await recordOwnerActivity({
      ownerId: owner.id,
      type: "OWNER_CREATED",
      description: `Owner ${owner.name} (${owner.ownerCode}) created`,
      actorId: session.user.id,
    });
    await recordAudit({
      userId: session.user.id,
      action: "CREATE",
      entityType: "Owner",
      entityId: owner.id,
      newValues: data,
    });

    return NextResponse.json({ owner }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
