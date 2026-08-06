import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";

/** Change 12 - Executive Favorites. Any authenticated user can favorite a property in their own org. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const organizationId = getOrganizationId(session.user.id);
    const property = await prisma.property.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!property) throw new ApiError(404, "Property not found");

    await prisma.propertyFavorite.upsert({
      where: { userId_propertyId: { userId: session.user.id, propertyId: id } },
      create: { userId: session.user.id, propertyId: id },
      update: {},
    });

    return NextResponse.json({ favorited: true });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    await prisma.propertyFavorite.deleteMany({ where: { userId: session.user.id, propertyId: id } });
    return NextResponse.json({ favorited: false });
  } catch (err) {
    return handleApiError(err);
  }
}
